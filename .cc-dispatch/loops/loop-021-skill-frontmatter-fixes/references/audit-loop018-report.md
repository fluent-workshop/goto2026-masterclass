# Skill Audit Report — loop-018-skill-audit

**Reviewer:** Independent blind review (1 of 2)
**Date:** 2026-06-21
**Rubric:** `references/skill-creator-SKILL.md` + `description-guide.md` + `gating.md` + `scripting.md`
**Scope:** 9 skills in `skills/` (excluding `skill-creator`). Read-only audit.

---

## Executive Summary

**The bodies are strong; the frontmatter is the problem.** Across all nine skills,
the SKILL.md *content* is consistently high quality — imperative voice, genuine
"why" alongside the "what", and (in the best cases) textbook progressive
disclosure. `cc-dispatch` and `specdocs` are model citizens of the body-lean /
depth-in-references pattern. Where the ecosystem falls down is the **description
frontmatter layer**, which is mechanical, measurable, and currently failing
against hard constraints the rubric calls out explicitly.

**The headline finding: 5 of 9 descriptions exceed the 160-byte hard cap and would
be rejected outright by `skill_workshop`.** Two of those use folded YAML block
scalars (`>`), which the description guide says the frontmatter parser does not
accept. This isn't a style nit — per the rubric these skills *cannot be applied or
updated through the governed pipeline in their current state*. That makes
description hygiene the single highest-leverage fix in the audit.

Byte-count census (rubric hard cap = 160):

| Skill | Bytes | Style | Trigger clause | Verdict |
|---|---|---|---|---|
| adhd | **640** | unquoted plain | yes | ❌ 4× over cap |
| specdocs | **305** | block scalar `>` | yes | ❌ over cap + illegal multiline |
| humanizer | **303** | block scalar `>` | yes | ❌ over cap + illegal multiline |
| scripting | **281** | unquoted plain | yes | ❌ over cap |
| web-scraping | **175** | unquoted plain | no | ❌ over cap, no "use when" |
| grill-me | 139 | quoted | yes | ✅ |
| cc-dispatch | 130 | quoted | no | ⚠️ no "use when" |
| code-review | 126 | quoted | yes | ✅ |
| product-manager | 103 | unquoted plain | no | ⚠️ no "use when" |

Secondary systemic findings (detailed below): gating is underused on skills with
real binary dependencies; `product-manager` gates through the **wrong namespace**
(`clawdbot` instead of `openclaw`), so its gate is dead; **no skill uses the
`{baseDir}` script-path convention**; and one skill (`web-scraping`) re-derives a
batch extractor inline on every run instead of shipping it as a `scripts/` helper,
the exact anti-pattern `scripting.md` warns against.

**Overall health: Needs Polish.** No skill needs a content rewrite. Most of the gap
closes with a mechanical frontmatter pass plus two structural refactors.

Scorecard:

| Skill | Score |
|---|---|
| cc-dispatch | **Pass** |
| code-review | **Pass** (minor notes) |
| grill-me | **Pass** (minor notes) |
| specdocs | **Needs Polish** (description blocks apply) |
| product-manager | **Needs Polish** |
| scripting | **Needs Polish** |
| humanizer | **Needs Polish** |
| web-scraping | **Needs Polish** |
| adhd | **Needs Polish** (description is a hard reject) |

---

## Cross-Cutting Findings

### C1 — Description byte-cap violations (Critical)
Five descriptions exceed 160 bytes and would be **rejected by `skill_workshop`**
(`description-guide.md`: "Descriptions over 160 bytes are rejected"). `adhd` at 640
bytes is 4× the cap. Fix per-skill below.

### C2 — Illegal multi-line block scalars (Critical)
`humanizer` and `specdocs` use folded `>` block scalars. `description-guide.md`:
"No multi-line values. The frontmatter parser accepts single-line descriptions
only. No YAML block scalars." Must collapse to a single quoted line.

### C3 — Unquoted descriptions (Minor mechanics)
`adhd`, `product-manager`, `scripting`, `web-scraping` use bare plain scalars.
`description-guide.md`: "Must be quoted. Always quote the value." Wrap in `"..."`.

### C4 — Missing "use when" trigger clauses (Moderate)
`cc-dispatch`, `product-manager`, and `web-scraping` describe *what* the skill does
but never name *when* to reach for it. The guide flags this as the most common
triggering failure ("No trigger context — skill never fires → Add 'use when the
user asks to...'"). Add an explicit trigger clause to each.

### C5 — `{baseDir}` convention unused everywhere (Moderate)
No skill references scripts via `{baseDir}`. `scripting.md`: "Always reference
scripts via `{baseDir}` so the path resolves correctly regardless of working
directory." Every skill hardcodes `skills/<name>/scripts/...`, which only resolves
from repo root. Affects `adhd`, `cc-dispatch`, `code-review`, `scripting`.

### C6 — Gating underused (Moderate)
`gating.md` says to gate skills with real binary/env dependencies so they stay
invisible (and token-free) when deps are absent. Skills that shell out to `bun`,
`claude`, or `tmux` ship ungated. See per-skill notes. (`grill-me`, `humanizer`,
`product-manager`, `scripting` have no gateable hard deps and correctly need none.)

---

## Per-Skill Findings

### adhd — Needs Polish
**Score: Needs Polish** (body is strong; description is a hard reject)

**Findings**
- **[Critical] Description is 640 bytes — 4× the 160-byte cap.** `skill_workshop`
  would reject this on create *and* update. It crams the full frame catalog
  (speedrunner/regulator/biology/...) and the skip-conditions into the description.
  That content belongs in the body (it's already there).
- **[Minor] Unquoted plain scalar** (C3). The long unquoted value is also fragile
  YAML.
- **[Moderate] Ungated despite hard deps.** Runs `bun run …/adhd.ts` and spawns
  `claude -p` headless processes. Per `gating.md` this should gate
  `requires.bins: ["bun", "claude"]` so it disappears when neither is installed.
- **[Minor] Hardcoded script path** `skills/adhd/scripts/adhd.ts` instead of
  `{baseDir}/scripts/adhd.ts` (C5).
- **Strengths:** Excellent body — 164 lines, strong "why" (the past-answer-three
  thesis), clear two-phase generator/critic split, explicit isolation invariant,
  defined output shape, real anti-patterns. A `scripts/adhd.ts` CLI exists for the
  deterministic orchestration — exactly what `scripting.md` wants.

**Recommendations**
1. Cut the description to ~150 bytes, quoted, single line. Suggested:
   `"Parallel divergent ideation for hard open-ended decisions — fans out isolated grounded Claude Code frames, then critiques. Use on /adhd or 'ADHD mode'."`
2. Add `metadata: {"openclaw": {"requires": {"bins": ["bun", "claude"]}}}`.
3. Swap hardcoded paths for `{baseDir}/scripts/adhd.ts`.

---

### cc-dispatch — Pass
**Score: Pass** (the reference implementation of the rubric)

**Findings**
- **Strengths:** 111-line body that is *pure* operational quick-reference, with all
  depth pushed into three companion docs (`goal-scoping.md`, `authoring-loops.md`,
  `internals.md`) and an explicit "read the one that matches your task" pointer.
  This is the progressive-disclosure ideal from `skill-creator-SKILL.md`. Scripts
  are well-factored (`scripts/cc-dispatch.ts` + `lib/`) per `scripting.md`. Strong
  economic "why" up front. Completion is event/hook-driven, never `exec sleep`.
- **[Moderate] Description lacks a "use when" trigger clause** (C4). It states
  capabilities ("loops, compact→continue, goal scoping, hooks") but no trigger
  context. At 130 bytes there's room to add one.
- **[Moderate] Ungated despite hard deps.** Depends on `bun` and `tmux` (and
  `claude`). Should gate `requires.bins: ["bun", "tmux"]`.
- **[Minor] Hardcoded `skills/cc-dispatch/scripts/...`** rather than `{baseDir}`
  (C5) — though it does alias to a `$CC` variable, which softens this.
- Note: `node_modules/` is present on disk but **correctly gitignored and
  untracked** — not a repo-hygiene issue.

**Recommendations**
1. Append a trigger clause, e.g. `"… Use when delegating substantial well-scoped work to a headless CC loop."` (watch the 160-byte budget).
2. Add `metadata: {"openclaw": {"requires": {"bins": ["bun", "tmux"]}}}`.

---

### code-review — Pass
**Score: Pass** (minor notes)

**Findings**
- **Strengths:** Description is 126 bytes, quoted, with a trigger ("Triggered on PR
  review requests"). Body models the rubric's completion-detection discipline
  beautifully — explicitly chooses sentinel files over `ps`/`sleep` polling, which
  directly honors the "don't `exec sleep`" anti-pattern. Optional external
  reviewers (Codex, CodeRabbit, SonarQube) are correctly handled by **prose
  graceful-degradation** ("use the reviewers you actually have installed") rather
  than hard failure — a sensible alternative to gating when deps are genuinely
  optional.
- **[Minor] Hardcoded cross-skill paths** (`skills/cc-dispatch/...`,
  `skills/sonarqube/...`) instead of `{baseDir}` / documented resolution (C5).
- **[Minor] Body density.** At 172 lines it's fine, but the Codex tmux+sentinel
  block and the CodeRabbit `cr` invocation are deep operational detail that could
  move to `references/` to keep the body scannable. Not required.

**Recommendations**
1. Optionally extract the Codex and CodeRabbit command recipes into
   `references/external-reviewers.md`, leaving a pointer in the body.
2. Consider a soft gate on the always-needed `bun`/`gh` if desired (low priority —
   the prose-optional approach is acceptable here).

---

### grill-me — Pass
**Score: Pass** (minor notes)

**Findings**
- **Strengths:** Description 139 bytes, quoted, concrete, with the trigger phrases
  duplicated cleanly into the body. Correctly names the OpenClaw built-in `message`
  tool with exact `action=send` / `presentation.blocks` usage — this is precisely
  the "tell the agent which tool to reach for" guidance from the rubric. Strong
  imperative voice, real anti-patterns, and a clear one-question-per-message
  invariant with the "why" (Discord 3-second ACK fragility).
- **[Minor] "Future Directions" (Valkey) section** is speculative and
  non-actionable — it documents a *limitation and a someday-fix*, not behavior the
  agent should execute. The rubric says "Don't encode what the base model already
  knows" and to keep the body to what the agent needs to act. Consider moving this
  to a `references/` design note.
- No gateable hard deps (uses built-in tools only) — correctly ungated.

**Recommendations**
1. Move the Valkey "Future Directions" note to `references/roadmap.md` (or cut).
   Keeps the body focused on actionable instructions.

---

### humanizer — Needs Polish
**Score: Needs Polish**

**Findings**
- **[Critical] Description is a 303-byte folded block scalar** (`>`). Violates both
  the 160-byte cap (C1) and the no-multiline / must-be-quoted rules (C2/C3). Hard
  reject by `skill_workshop`.
- **[Moderate] 47-pattern catalog lives entirely in the body** (326 lines). Under
  the 500-line ceiling, but this is exactly the "long reference catalog" the rubric
  says to push into `references/`: "Push long examples, API docs, and deep patterns
  into `references/`. Keep the body focused on what the agent needs to act." The
  lean "Process" + "Personality and Soul" sections are the actionable core; the 47
  enumerated patterns are reference material that's loaded on every trigger.
- **[Moderate] `TTS.md` is a stray second skill, not a reference.** It carries its
  own frontmatter (`name: humanizer-tts`, its own description) and sits as a sibling
  to SKILL.md — not under `references/`, and **never referenced by the body**. It's
  either a mispackaged separate skill or an orphaned file. Per the skill shape in
  the rubric, support docs go in `references/`; a second `name:`'d skill should be
  its own directory.
- **Strengths:** The content itself is excellent and genuinely non-obvious (the
  kind of brittle, specific knowledge the rubric says *to* encode). Strong "why"
  (the statistical-likelihood insight). Imperative fixes per pattern.

**Recommendations**
1. Collapse the description to one quoted ≤160-byte line, e.g.:
   `"Remove AI-writing tells from text. Use when asked to humanize, de-slop, or make writing sound human."`
2. Move the 47-pattern catalog to `references/patterns.md`; keep Process +
   Personality in the body with a pointer ("Full pattern catalog:
   `references/patterns.md`").
3. Decide `TTS.md`'s fate: promote to its own `humanizer-tts/` skill directory, or
   relocate to `references/tts.md` and link it from the body.

---

### product-manager — Needs Polish
**Score: Needs Polish**

**Findings**
- **[Moderate] `metadata.clawdbot` is the wrong namespace.** `gating.md` is
  unambiguous: the gate object is `metadata.openclaw`. As written, the gate is
  inert — OpenClaw will not read `clawdbot`. (The `os: ["linux","darwin","win32"]`
  is also an array; the documented form is a single string like `"darwin"` — though
  here it's moot since it allows all three anyway.)
- **[Moderate] No "use when" trigger clause** (C4). 103 bytes leaves ample room.
  The description states a capability ("Build products users love …") but gives the
  agent no trigger signal.
- **[Minor] Unquoted plain scalar** (C3).
- **Strengths:** Lean 49-line body, well within budget. Imperative, opinionated
  bullets with compressed "why" ("focus is a feature", "everything is P1 means
  nothing is"). Good fit for a principles skill.

**Recommendations**
1. Rename `metadata.clawdbot` → `metadata.openclaw` (or drop it — there are no real
   deps to gate, so it's optional decoration; if kept for the emoji, fix the key).
2. Add a trigger clause and quote it, e.g.:
   `"Product management principles for discovery, prioritization, and roadmapping. Use when scoping features, prioritizing, or planning a roadmap."`

---

### scripting — Needs Polish
**Score: Needs Polish**

**Findings**
- **[Critical] Description is 281 bytes** — over the cap (C1), unquoted (C3). Would
  be rejected by `skill_workshop`.
- **[Moderate] Body duplicates `references/bun-template.md`.** The body inlines full
  CLI scaffolding, credential-loading, arg-parsing, and Python templates (329
  lines), while `references/bun-template.md` already exists for exactly that. The
  rubric's progressive-disclosure rule wants the large copy-paste templates in
  `references/`, with the body holding the decision rules (when Bun vs Python, when
  to split). Right now the body *is* the template.
- **[Minor] Hardcoded `skills/sonarqube/...` path** (C5); SonarQube section is
  correctly prose-gated as optional ("not included in this workspace").
- **Strengths:** Genuinely useful, correct conventions. Good language-selection
  table and "why" reasoning. This is meta-guidance with no hard deps of its own —
  correctly ungated.

**Recommendations**
1. Trim the description to ≤160 bytes, quoted. Suggested:
   `"Conventions for Bun+TypeScript (and Python) CLI scripts in skills. Use when writing, refactoring, or reviewing skill scripts."`
2. Move the large CLI/Python code templates into `references/bun-template.md` (and a
   sibling `references/python-template.md`); keep the body to selection rules,
   principles, and the split thresholds, with pointers to the templates.

---

### specdocs — Needs Polish
**Score: Needs Polish** (body is Pass-quality; the description blocks it)

**Findings**
- **[Critical] Description is a 305-byte folded block scalar** (`>`). Over cap (C1)
  + illegal multiline (C2). Hard reject.
- **Strengths:** Otherwise exemplary. 97-line body; all heavy content (PRD/ADR
  templates, calibration examples) correctly externalized into `templates/` and
  `references/`, loaded only when needed — the rubric's progressive-disclosure
  model done right. Optional Notion sync is cleanly prose-gated. Strong imperative
  workflow with quality bars. No hard deps requiring a metadata gate.

**Recommendations**
1. Collapse the description to one quoted ≤160-byte line, e.g.:
   `"Draft PRDs and ADRs from the specdocs templates. Use when writing, reviewing, or scoping a PRD/ADR or documenting a technical decision."`
   No other changes needed — this is a near-Pass gated only by the frontmatter.

---

### web-scraping — Needs Polish
**Score: Needs Polish**

**Findings**
- **[Critical] Description is 175 bytes** — over the cap (C1), unquoted (C3).
- **[Moderate] No "use when" trigger clause** (C4). The guide's own canonical
  good-description example *is a web-scraping skill* with an explicit "Use when the
  user asks to scrape, crawl, extract, or download data from a URL" — this skill
  omits exactly that clause.
- **[Moderate] Batch extractor is re-derived inline, not shipped as a script.** The
  skill has **no `scripts/` directory**; Phase 5 hands the agent full
  Bun/`bottleneck` and Python extraction loops to retype each run. `scripting.md`
  names this precisely: "The same code would be rewritten by the agent on every
  invocation (extraction loops, format converters, validators)" → write a
  `scripts/` helper. A parameterized `scripts/scrape.ts` (URL list in, raw cache +
  JSON out, rate-limited) would replace the inline code blocks and save tokens on
  every trigger.
- **[Minor] Body at 439 lines** is the closest to the 500-line ceiling. Extracting
  the Phase 5 code into the proposed script also trims the body materially.
- **Strengths:** Excellent pipeline reasoning with strong "why" (browser→HTTP
  switch economics, raw-cache-as-safety-net). Auth handling and the deep Playwright
  pattern are correctly pushed to `references/browser-auth.md`. Good anti-patterns
  section. In-script rate-limit sleeps are legitimate (not the `exec sleep`
  anti-pattern, which is about agent-loop timing).

**Recommendations**
1. Rewrite the description ≤160 bytes, quoted, with a trigger clause, e.g.:
   `"Extract structured data from any site — browser recon then HTTP batch. Use when asked to scrape, crawl, or download data from a URL."`
2. Add `scripts/scrape.ts` (Bun + `bottleneck`) implementing Phase 5; replace the
   inline code with a `{baseDir}/scripts/scrape.ts` invocation. Consider gating
   `requires.bins: ["bun"]`.

---

## Priority Fix List (highest leverage first)

1. **Fix the 5 over-cap descriptions** (`adhd`, `specdocs`, `humanizer`,
   `scripting`, `web-scraping`) — they are non-deployable through `skill_workshop`
   today. Collapse block scalars, quote, add trigger clauses. (C1/C2/C3/C4)
2. **Fix `product-manager` gating namespace** `clawdbot` → `openclaw`. (C6)
3. **Add `metadata.openclaw.requires.bins` gates** to `adhd` (bun, claude),
   `cc-dispatch` (bun, tmux), `web-scraping` (bun). (C6)
4. **Refactor for progressive disclosure:** move `humanizer`'s 47-pattern catalog
   and `scripting`'s code templates into `references/`.
5. **Ship `web-scraping`'s batch extractor as `scripts/scrape.ts`.** (scripting.md)
6. **Adopt `{baseDir}` script paths** across `adhd`, `cc-dispatch`, `code-review`,
   `scripting`. (C5)
7. **Resolve `humanizer/TTS.md`** — promote to its own skill or move to
   `references/`.

*All fixes must be applied via `skill_workshop` (create/update), never direct
`Write`/`Edit` — per the rubric's primary anti-pattern. This audit did not modify
any skill files.*
