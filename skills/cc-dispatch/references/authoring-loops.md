# Authoring Loops — folders, prompt.md, provisioning, the handoff

How to actually write a loop and hand it to CC. Pair this with `references/goal-scoping.md` (how to size the goal) and `references/internals.md` (the hook system).

---

## Loop folder anatomy

```
.cc-dispatch/loops/loop-NNN-descriptive-slug/
  references/      # context provisioned FOR CC (INDEX.md + exports/docs/scrapes)
  goal.md          # full spec: phases, per-finding detail, green-gate, safety rules
  prompt.md        # the lean brief that goes into /goal [prompt.md]
  report.md        # CC writes this at checkpoint
  progress.md      # per-turn heartbeat (written by the Stop hook — see internals.md)
  compact.md       # the /compact instruction used to ENTER this loop (continue writes it)
```

### Loop naming

Must be `loop-NNN-descriptive-slug`, zero-padded:
- ✅ `loop-001-storybook-visual-harness`, `loop-002-gate-hardening`
- ❌ `loop-001` (bare — rejected by `launch`/`continue`), `loop-3-fix` (not zero-padded)

### goal.md vs prompt.md

- **`goal.md`** — the detailed spec. Phases, per-finding descriptions, green-gate criteria, safety rules, context. This is what you author when designing the loop.
- **`prompt.md`** — the lean brief (10–15 lines, hand-authored) CC receives via `/goal [prompt.md]`. Keeps CC's goal token budget lean. Points at `goal.md` + `references/` as required reading.

### Feature/fix numbering

Use `F1`, `F2`, … for features and `RS1`, `RS2`, … for review-sourced fixes in `goal.md`. CC references these in `report.md` and commit messages — keeps reviewers oriented across iterations.

---

## Provisioning context: the `references/` folder

**CC starts cold.** No OpenClaw history, no Notion/Exa, no web-fetch, no MCP — only what's on disk. Delegating without context = CC guesses = rework that costs more than the delegation saved.

Every loop folder scaffolds a `references/` dir with an `INDEX.md` on launch/continue. Before dispatching, materialize everything CC needs but can't reach:

```
references/
  INDEX.md              # manifest: each file, what it is, why CC needs it
  research-summary.md   # exported Notion/Exa research
  api-reference.md      # scraped vendor/developer docs
  session-excerpts.md   # salient parts of the OpenClaw session/conversation
```

`INDEX.md` is a manifest table (file / what it is / why CC needs it). Keep it honest — an empty `references/` means the loop is under-provisioned and CC will guess. **Aim for zero information loss in the handoff.**

---

## Writing prompt.md (six required elements)

Fidelity varies wildly without all six:

1. **One-sentence objective** — what this loop produces (ambitious, spans the related issues — see goal-scoping.md).
2. **READ FIRST pointer(s)** — `goal.md` AND `references/` (read INDEX.md then everything it lists); plus any key source files.
3. **Mode** — `autonomous (--dangerously-skip-permissions)` or `interactive`; branch/repo specifics.
4. **Out-of-scope guardrails** — what this loop must NOT touch. If it's obvious, say it anyway.
5. **Completion condition (evaluator-graded)** — a measurable end state the agent's own output proves: test/build/typecheck result, file counts, an empty queue, per-item status in report.md. Include a turn/time bound. This is what goes into `/goal`.
6. **Stop condition (behavioural)** — when to write `report.md` and go idle; name what comes next so CC knows not to start it.

### Example (the target bar)

```markdown
Migrate every call site from the legacy client to the shared library in this package.

READ FIRST:
- `.cc-dispatch/loops/loop-002-client-migration/goal.md` — full spec.
- `.cc-dispatch/loops/loop-002-client-migration/references/` — INDEX.md, then everything it lists.

Mode: autonomous (`--dangerously-skip-permissions`), work directly on `main`.
Migrate all call sites; update imports; delete the legacy shim once unused.
Do NOT change any public API signatures — internal call sites only.

Done when: `<test command>` and `<typecheck command>` are both clean; no remaining
imports of the legacy client (grep is empty); each batch committed referencing the
migration — or stop after 40 turns and report what's blocking.

Stop after the gate passes: write `report.md`, commit, notify. Do not begin the next loop.
```

### launch/continue and prompt.md

- **`prompt.md` already exists** → never overwritten. The hand-authored file is used as-is.
- **`prompt.md` missing** → a lean labeled template is written and the command stops so you can author it. A template with unfilled brackets is worse than nothing.
- Both commands also scaffold `references/INDEX.md` if absent.

**Author `goal.md`, `prompt.md`, and `references/` before dispatching.**

---

## Launch — full flag table

| Flag | Default | Description |
|---|---|---|
| `--task "..."` | — | Free-text task description (the brief) |
| `--issue-url URL` | — | GitHub issue URL (fetches title + body) |
| `--loop <name>` | — | Loop folder — must be `loop-NNN-descriptive-slug` |
| `--name <name>` | cwd basename | Explicit tmux session name |
| `--mode` | `autonomous` | `autonomous` or `interactive` |
| `--worktree` | off | Create a git worktree (own cwd → own session, for parallel work) |
| `--force-worktree` | off | Create worktree even if the tree is dirty |
| `--notify-channel` | — | Delivery channel (e.g. `discord`) |
| `--notify-to` | — | Recipient (e.g. `channel:1234`) |
| `--notify-account` | — | Account id (e.g. `default`) |
| `--notify-wake-session` | — | Orchestrator session key to WAKE on intervention/failure/completion |

Session name priority: `--name` > cwd basename. Never the loop name — loops come and go within one session.

---

## Loop lifecycle

```
1. Author goal.md → provision references/ → author prompt.md (six elements) → get approval
2a. First loop in a fresh cwd:  cc-dispatch launch --loop loop-NNN-slug --repo ... --notify-* ...
2b. Next loop, same session:    cc-dispatch continue --session <cwd-name> --loop loop-NNN-slug --compact "keep:...;drop:..."
3. Issue /goal with the inline completion condition (launch only; continue sends it for you)
4. CC reads prompt.md → goal.md + references/ → works → per-turn evaluator grades → writes report.md → goes idle
5. Hooks fire: progress.md each turn; wake/notify on completion or intervention
6. Milestone review IF the milestone warrants it (not every loop — see goal-scoping.md)
7. Distill findings → author next loop's goal.md → references/ → prompt.md → back to 2b
```

---

## Compact → continue (reusing a warm session)

**This is the default between loops.** Don't kill and re-launch unless the session is actually broken — reusing keeps CC warm and preserves harness context. **Never `/exit` to signal done** (kills warmth; `-p` headless is also pay-as-you-go). The session lives the whole time.

### The `continue` subcommand

```bash
bun run skills/cc-dispatch/scripts/cc-dispatch.ts continue \
  --session my-app \
  --loop loop-002-client-migration \
  --compact "keep: migration target list, shared-lib API surface, completed batches; drop: install output, failed attempts"
```

`--session` is the **cwd-named** session, not a loop name. `continue`:
1. Verifies the session is alive in tmux and resolves its cwd from the manifest.
2. Ensures `loops/<loop>/prompt.md` exists (writes a template + stops if missing) and scaffolds `references/INDEX.md`.
3. Writes the compaction text to `loops/<loop>/compact.md` (auditable handoff record).
4. Sends `/compact [<your text>]` to the pane.
5. Waits for compaction, then sends the next `/goal` (use the condition-embedding form).
6. Updates the manifest's brief path.

Flags: `--compact "keep:...;drop:..."` (or `--compact-file <path>`); `--no-compact` (skip compaction, just send the next `/goal` when context is already lean).

### Session healthy → `continue`. Session broken/dead → cleanup + relaunch:

```bash
bun run skills/cc-dispatch/scripts/cc-dispatch.ts cleanup --session SESSION_NAME --confirm
bun run skills/cc-dispatch/scripts/cc-dispatch.ts launch --loop loop-NNN-slug --repo ... --notify-* ...
```
