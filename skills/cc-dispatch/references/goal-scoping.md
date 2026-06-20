# Goal Scoping — sizing a `/goal` and the three-layer model

Read this **before authoring any loop.** Over-granular agents are the #1 failure mode, and it traces directly to how `/goal` is scoped.

---

## The three-layer execution model

Autonomous loop work has **three separate checks at different cadences.** Conflating them is what makes agents over-supervised and over-granular.

| Layer | What it is | Cadence | Who runs it | Cost |
|---|---|---|---|---|
| **1. Mission** | The `/goal` completion condition — the ambitious objective the session drives toward | Once per loop (can span an hour+ and a whole backlog) | You author it | — |
| **2. Per-turn gate** | The evaluator behind `/goal` — judges "is the condition met?" from the transcript after every turn | Every turn, automatic | Configured small-fast model (Haiku by default) | Negligible |
| **3. Milestone review** | The blind multi-source review (CC + Codex + CodeRabbit + Sonar) | At design-coherent milestones, NOT every loop | You trigger it; 10–20 min | High (human + tokens) |

**The key insight: granularity of the completion condition ≠ granularity of the work.** A single `/goal` can drive an hour-plus of autonomous, unsupervised work — the condition just has to be a *verifiable end state*, not a small task. Make the end state checkable, not the work small.

### Layer 1 — Mission: make goals backlog-shaped for fire-and-forget autonomy

To dispatch heavy work and walk away, the goal should encompass a whole backlog with a single verifiable end state. The agent self-sequences through it; the per-turn gate checks the end state each turn; a wake pings you when it's done or stuck.

```
/goal Work through every issue labeled <label> until the queue is empty, each fix committed referencing its issue, and `<test command>` is green — or stop after 60 turns and report what's blocking.
```

One goal, an hour+ across many issues, fully unsupervised. Authoring one narrow goal per loop and reviewing after each is a *choice*, not a constraint of `/goal`.

### Layer 2 — Per-turn gate: the autonomy engine, keep it every turn

The evaluator is the maker/checker split that keeps the loop honest while you're away.

**Precisely:** `/goal` is a wrapper around a **session-scoped, prompt-based Stop hook** — the same hooks subsystem cc-dispatch uses for `SessionEnd`/`PostCompact`, just a different hook *type* (prompt-based + model-evaluated). After each turn the condition + conversation go to the session's **configured small-fast model — Haiku by default** (follows your `model-config` small-fast slot + the session provider). It returns yes/no + a reason; "no" feeds the reason back as next-turn guidance.

**Consequences:**
- The evaluator does **not** run commands or read files — it only judges what's **surfaced in the transcript.** Conditions must be provable from CC's own output.
- `disableAllHooks` (or managed `allowManagedHooksOnly`) disables BOTH `/goal` and the notify hooks. `/goal` also needs the workspace trust dialog.

### Layer 3 — Milestone review: decouple from the goal cycle

The heavy blind review needs human judgment + 10–20 min. It does **not** belong on every goal. Batch it at design-coherent milestones. Cadence is **inversely proportional to how established the pattern is:**

- **Greenfield / architectural / novel work → review every loop.** Error compounds: a wrong abstraction in loop 1 gets built on in loops 2–5, and the automated gate won't catch it because tests pass on a bad design.
- **Mechanical grind against a trusted gate → batch the review.** Once a gate is validated, "do the next N of the same thing" loops can't compound much — each item passes the gate or doesn't. Chain several, review once at the milestone.

Rule of thumb: review when a *human-judgment surface* changes (new abstraction, dependency, public API), not when a *mechanical count* goes up (one more component ported).

---

## How `/goal` works (the mechanic that drives scoping)

`/goal <condition>` sets a stopping condition graded by a separate model after every turn (Haiku by default — see Layer 2). "No" → another turn. "Yes" → goal clears. Maker and checker are different models — that's the point.

**Critical constraint:** the evaluator does not run commands or read files; it only judges the transcript.

- ❌ `/goal Read prompt.md and execute it` is nearly ungradeable. The evaluator can't verify "execute," sees the agent did *something*, rubber-stamps it — training the agent toward micro-goals.
- ✅ `/goal <test command> passes green; build and typecheck clean; every backlog item committed; report.md lists each item's status — or stop after N turns and report` gives a real end state the agent's own output proves.

### Issue the goal with the condition embedded

```
/goal Follow .cc-dispatch/loops/loop-002-client-migration/prompt.md (read goal.md + references/ first). Done when: test + typecheck clean, no legacy-client imports remain, each batch committed — or stop after 40 turns and report.
```

---

## One loop = one ambitious objective on one verifiable end state

The objective can — and often should — span several inter-related issues.

**Bundle into one goal when they:**
- Share a verification surface (same test suite, build gate, typecheck)
- Would conflict or rework each other if done separately
- Are all prerequisites for the same milestone

**Split into separate loops when:**
- A human review gate sits between them (review the plan before the apply)
- Their verification surfaces genuinely diverge (a UI pixel gate vs a DB migration)
- One is exploratory/risky enough you want to review before building on it

### Examples of correctly-ambitious objectives (hour-ish band)

- *Migrate every call site from the old HTTP client to the shared library until the test suite and typecheck are both clean, with no public API changes.*
- *Work through every issue labeled `backlog-q3` until the queue is empty, each fix committed referencing its issue, and the test suite is green — or stop after 60 turns and report.*
- *Split a large module into focused files each under a size budget until typecheck passes and every existing CLI command still runs.*
- *Implement every acceptance criterion in the linked design doc until all criteria are demonstrably met in the test output — or stop after 40 turns and report which remain.*

---

## Anti-patterns

- **Directive-as-goal:** `/goal implement the feature` — no measurable end state; grades fail open.
- **Single-issue goals when issues share a gate** — wastes loop machinery, multiplies compaction overhead, makes the agent feel granular.
- **Unbounded goals** — always include a turn/time clause (`or stop after N turns and report`) so a stuck loop reports instead of burning tokens.
- **Review-per-goal on mechanical work** — batch the heavy review at milestones.
- **Under-provisioned delegation** — dispatching with an empty `references/` folder; CC guesses at everything not on disk.
