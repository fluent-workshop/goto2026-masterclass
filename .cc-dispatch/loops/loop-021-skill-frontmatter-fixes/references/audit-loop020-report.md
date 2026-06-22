# Skill Audit Report — loop-020-skill-audit-2 (Blind Review #2)

**Reviewer:** independent blind reviewer (one of two; other reviewer's output unknown)
**Date:** 2026-06-22
**Scope:** 10 skills in `skills/` (excluding `skill-creator`, which is the rubric)
**Rubric:** `references/skill-creator-SKILL.md` + `description-guide.md`, `gating.md`, `scripting.md`
**Constraint:** read-only — no skill files were modified.

---

## Executive Summary

Overall health is **good on substance, weak on frontmatter mechanics**. The skill
*bodies* are, with one exception, well-written: imperative voice, real "why"
explanations, honest disclosure of un-bundled prerequisites, and genuine
progressive disclosure into `references/`. The failures cluster almost entirely in
two mechanical areas that the rubric treats as hard constraints:

1. **Description frontmatter.** 5 of 10 descriptions exceed the 160-byte hard cap
   (`description-guide.md`), two of those via multi-line YAML block scalars that the
   single-line parser rejects, and 7 of 10 are not quoted as the rubric requires.
   These are not style nits — `skill_workshop` *rejects* over-cap and multi-line
   descriptions, so several of these skills would fail to deploy as written.

2. **Gating mechanics.** `product-manager` gates under the **wrong namespace**
   (`clawdbot` instead of `openclaw`), and `tts` uses **multi-line YAML** for
   `metadata.openclaw` where `gating.md` mandates single-line JSON — meaning the
   only two skills that attempt gating both do it in a form the rubric says won't
   work.

A third, **workspace-wide** finding: **no skill uses `{baseDir}`** for script
paths. Every script invocation hardcodes `skills/<name>/scripts/...`, contradicting
`scripting.md` ("Use `{baseDir}` — OpenClaw substitutes the skill's directory path
at runtime"). This is systemic and worth a single coordinated fix.

### Headline findings

| # | Finding | Severity | Skills affected |
|---|---------|----------|-----------------|
| 1 | Description over 160-byte hard cap (would be rejected) | **Critical** | adhd (640B), specdocs (305B), humanizer (303B), scripting (281B), web-scraping (175B) |
| 2 | Multi-line description (block scalar — rejected by parser) | **Critical** | humanizer, specdocs |
| 3 | Wrong gating namespace `clawdbot` vs `openclaw` | **Major** | product-manager |
| 4 | `metadata.openclaw` as multi-line YAML, not single-line JSON | **Major** | tts |
| 5 | Description not quoted | Minor | adhd, product-manager, scripting, tts, web-scraping (+ humanizer/specdocs via `>`) |
| 6 | Script paths hardcoded instead of `{baseDir}` | Minor (systemic) | adhd, cc-dispatch, code-review, tts, scripting |
| 7 | Generic content the base model already knows; no trigger clause | Major | product-manager |

### Structural comparison to the first 9-skill pass

This pass is the first to include **`tts`** (new skill) and the first to see
**`web-scraping`'s `references/browser-auth.md`** (added since loop-018). Structurally,
the corpus is healthy: skills that should have references have them
(`cc-dispatch` → 3 docs, `specdocs` → templates + example, `tts` → 3 refs,
`web-scraping` → browser-auth, `scripting` → bun-template). Bodies are all under the
500-line guidance (largest: `web-scraping` 439, `humanizer` 326). The *new* skill
(`tts`) is one of the best-written bodies in the set but ships the single most
consequential mechanical bug (a likely-nonfunctional gate on a skill that genuinely
needs one). The recurring defect class across the corpus is unchanged: frontmatter
discipline (byte cap, quoting, single-line, namespace) lags well behind body quality.

---

## Per-Skill Sections

### 1. adhd — **Needs Polish** (one blocking defect)

**Findings**
- **Description: 640 bytes, ~4× the 160-byte hard cap, unquoted** (`SKILL.md:3`).
  Per `description-guide.md` this is rejected outright by `skill_workshop` — the
  skill cannot deploy as written. This is the single blocking issue.
- Script paths hardcoded: `bun run skills/adhd/scripts/adhd.ts ...`
  (`SKILL.md:52,64,68,69`) — should use `{baseDir}/scripts/adhd.ts` per
  `scripting.md:184-192`.
- Extra `license: MIT` frontmatter field — allowed (everything beyond
  name/description is optional), noted only for completeness.

**Strengths** — Body is exemplary against the rubric: imperative voice, strong
"why" (the "answers past number three" framing, the isolation invariant rationale),
explicit output format, anti-patterns section, and disposable run-dir layout. This
is a model body wrapped in a non-deployable description.

**Recommendations**
- Cut the description to ≤160 bytes and quote it. Keep what-it-does + a trigger
  clause; move the frame catalog and skip-conditions into the body (they already
  exist there). Example (143B): `"Parallel divergent ideation: fan out N isolated, grounded Claude Code frames under different lenses, then critique. Use on /adhd or open-ended design."`
- Replace the four hardcoded `skills/adhd/scripts/...` paths with `{baseDir}/scripts/...`.

---

### 2. cc-dispatch — **Pass**

**Findings**
- Script path hardcoded via `CC=skills/cc-dispatch/scripts/cc-dispatch.ts`
  (`SKILL.md:45`) — should be `{baseDir}/scripts/cc-dispatch.ts` per `scripting.md`.
  Minor, and the only finding.

**Strengths** — Best-in-class progressive disclosure: a lean operational
quick-reference body (111 lines) that explicitly routes depth to three named
companion docs (`goal-scoping.md`, `authoring-loops.md`, `internals.md`).
Description is quoted, single-line, 130 bytes, concrete. Strong "why" throughout
(the flat-rate economics rationale, the wake→channel contract). References built-in
behavior precisely.

**Recommendations** — Swap the one hardcoded path for `{baseDir}`. Otherwise ship.

---

### 3. code-review — **Pass** (light polish)

**Findings**
- Hardcoded script paths to other skills: `skills/cc-dispatch/scripts/...`
  (`:42`), `skills/sonarqube/scripts/...` (`:88-89`). Cross-skill references are
  inherently awkward for `{baseDir}` (it resolves to *this* skill's dir), so this is
  a soft finding — but worth a note that the sonarqube paths assume an un-bundled
  skill.
- Description (126B, quoted, single-line) is concrete but its trigger signal
  ("Triggered on PR review requests") is thinner than the `description-guide.md`
  "use when…" pattern. The body's `## Trigger` section compensates.

**Strengths** — Honest prerequisites callout up top (Codex/SonarQube/CodeRabbit
not bundled; each section optional). Excellent operational "why" (sentinel-file
completion vs PID polling, effort=high vs xhigh rationale, the zod-v4 false
positive). Clear severity discipline and blind-review principle.

**Recommendations**
- Optionally strengthen the description with an explicit trigger clause, e.g.
  append "Use when a PR link is posted for review." (stays well under 160B).
- Leave cross-skill paths as-is or note they depend on companion skills being present.

---

### 4. grill-me — **Pass**

**Findings** — No rubric violations of consequence.
- "Future Directions" section (Valkey button-waking, `:172-174`) is aspirational
  rather than actionable — borderline against "don't cram everything into the body,"
  but it's short and clearly labeled. Optional trim.

**Strengths** — Description quoted, single-line, 139 bytes, with concrete triggers.
References the built-in `message` tool by name (rubric: "reference built-in tools by
name"). Strong "why" on the 30-second HITL bright line and the plain-text-over-buttons
reliability rationale. Clear anti-patterns. No scripts, so no path concerns.

**Recommendations** — Optionally move "Future Directions" to a reference file to keep
the trigger-time body lean. Not required.

---

### 5. humanizer — **Needs Polish** (blocking description defect)

**Findings**
- **Description uses a multi-line YAML block scalar (`>`), 303 bytes**
  (`SKILL.md:3-8`). Violates two hard constraints in `description-guide.md`:
  the 160-byte cap **and** the "no multi-line values / no YAML block scalars" rule.
  Would be rejected by `skill_workshop`. Blocking.
- Body is 326 lines / 19KB — under the 500-line guidance and the 40KB cap, but the
  47 inline patterns are the kind of deep reference content `skill-creator` suggests
  pushing to `references/`. Defensible (the patterns *are* the actionable core), so
  this is a judgment call, not a violation.
- `TTS.md` sits at the skill root rather than under `references/` — minor structural
  inconsistency with the documented skill shape.

**Strengths** — Outstanding "why" (the statistical-mean insight up front), concrete
watch-for/fix pairs, positive *and* negative examples (pattern #43). This is a
genuinely useful reference body.

**Recommendations**
- Rewrite the description as a single quoted line ≤160 bytes. Example (148B):
  `"Remove signs of AI-generated writing. Use when asked to humanize, de-slop, or make text sound human; detects 27+ AI writing patterns."`
- Consider moving `TTS.md` under `references/` for consistency (note: `tts` skill
  already has its own `references/humanizer-tts.md`, so confirm which is canonical).

---

### 6. product-manager — **Major Rewrite**

**Findings**
- **Wrong gating namespace:** `metadata: {"clawdbot":{...}}` (`SKILL.md:4`). The
  rubric (`gating.md`) requires `metadata.openclaw`. Under `clawdbot` the gate is
  inert — the OS filter never applies. This is exactly the namespace error called
  out in the goal criteria.
- **`name: Product Manager`** (`SKILL.md:2`) — title-cased with a space, not the
  kebab-case slug the skill shape documents (`name: my-skill`). Inconsistent with the
  `product-manager` directory name.
- **Description has no trigger clause** (`SKILL.md:3`, 103B, unquoted): "Build
  products users love with discovery, prioritization, roadmapping, and
  cross-functional leadership." Pure capability statement, no "use when…" — per
  `description-guide.md` this is the #1 cause of a skill never firing.
- **Body encodes what the base model already knows.** The rubric is explicit:
  "Don't repeat what the base model already knows… Skip generic advice." The entire
  body is generic PM maxims ("Say no more than yes", "Outcomes over outputs") with no
  workflow, no built-in tool references, no output format, no non-obvious procedure.

**Strengths** — Coherent and well-organized as a list of principles. The gating
*intent* (cross-platform OS filter) is reasonable; only the namespace is wrong.

**Recommendations**
- Change `clawdbot` → `openclaw`; the OS array is already valid.
- Rename `name` to `product-manager` (kebab-case) to match the directory.
- Quote the description and add a trigger clause, e.g.
  `"Product discovery, prioritization, and roadmapping guidance. Use when scoping a product decision, writing a roadmap, or prioritizing a backlog."`
- Either (a) reframe the body around a concrete repeatable workflow with tool
  references and an output format, or (b) accept it as a lightweight "principles"
  skill — but then justify why it earns per-turn token cost over base-model knowledge.

---

### 7. scripting — **Needs Polish** (blocking description defect)

**Findings**
- **Description: 281 bytes, unquoted** (`SKILL.md:3`). Over the 160-byte cap → would
  be rejected. Blocking. (Single-line, at least.)
- The skill *teaches* scripting conventions but its own examples use hardcoded
  `skills/sonarqube/scripts/...` (`:316,322`) and `uv run scripts/<tool>.py` rather
  than demonstrating the `{baseDir}` substitution the rubric mandates. Since this is
  the canonical scripting-conventions skill, omitting `{baseDir}` is a notable gap —
  it should model the rule it exists to teach.

**Strengths** — Excellent, dense, accurate content: language-selection table, CLI
structure, credential loading via env/`op`, output helpers, modularity thresholds.
Honest SonarQube prerequisite disclosure. Points to `references/bun-template.md` and
to `skill-creator` for structure — good cross-linking.

**Recommendations**
- Cut the description to ≤160B and quote it. Example (150B):
  `"Conventions for Bun+TypeScript (and Python) CLI scripts in skills. Use when writing, refactoring, or reviewing skill scripts or CLI code."`
- Add a short `{baseDir}` section so this skill models the script-path rule it teaches.

---

### 8. specdocs — **Needs Polish** (blocking description defect)

**Findings**
- **Description: multi-line block scalar (`>`), 305 bytes** (`SKILL.md:3-8`).
  Violates the 160-byte cap and the single-line / no-block-scalar rule. Would be
  rejected by `skill_workshop`. Blocking.

**Strengths** — Strong progressive disclosure: templates in `templates/`, calibration
example in `references/`, body kept to a 97-line workflow. Explicit "read the template
in full before drafting" instruction. Honest Notion/tracker prerequisite disclosure.
Clear quality bar with measurable criteria. Good attribution.

**Recommendations**
- Rewrite as a single quoted line ≤160B. Example (152B):
  `"Draft PRDs (15-section) and ADRs (MADR 4.0) from templates. Use when asked to write, draft, or review a PRD/ADR, scope a feature, or document a decision."`

---

### 9. tts — **Needs Polish** (gating likely nonfunctional)

**Findings**
- **`metadata.openclaw` is multi-line YAML, not single-line JSON** (`SKILL.md:4-10`).
  `gating.md` is explicit: "`metadata.openclaw` must be single-line JSON in the
  frontmatter. The parser does not support multi-line YAML objects here." As written,
  the gate likely does not parse — so a skill with **real** dependencies
  (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`) would show up ungated and fail at run
  time when keys are absent, which is precisely the failure gating exists to prevent.
  Highest-leverage single fix in this skill.
- **Missing binary gates.** Scripts run via `bun` (`requires.bins: ["bun"]`), and
  `--stretch` requires `ffmpeg` on PATH (`SKILL.md:73`). Neither is gated. `ffmpeg`
  is optional (stretch-only), but `bun` is mandatory to run any command.
- Description (112B) is **unquoted** (`SKILL.md:3`); rubric says always quote.
- Script paths hardcoded `bun run skills/tts/scripts/tts.ts ...`
  (`:25-43`) instead of `{baseDir}`.

**Strengths** — One of the best bodies in the corpus: quick reference, content-
addressable cache explained with its exact key composition, humanizer-first ordering
with rationale, batch manifest schema, three well-scoped reference files. Description
content is concrete with a clean trigger clause. Correct `openclaw` namespace and
`primaryEnv` intent — only the *format* is wrong.

**Recommendations**
- Convert the gate to single-line JSON and add `bun`:
  `metadata: {"openclaw": {"requires": {"bins": ["bun"], "env": ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]}, "primaryEnv": "ELEVENLABS_API_KEY"}}`
  (optionally add `ffmpeg` to bins if stretch should be a hard requirement, or leave
  it as the documented runtime check it is now).
- Quote the description.
- Replace hardcoded script paths with `{baseDir}/scripts/tts.ts`.

---

### 10. web-scraping — **Needs Polish**

**Findings**
- **Description: 175 bytes, unquoted** (`SKILL.md:3`). 15 bytes over the cap → would
  be rejected. It also contains an em dash (—), ironically a pattern the sibling
  `humanizer` skill bans. Blocking until trimmed.
- Body is 439 lines — under the 500-line guidance but the largest in the set, with
  substantial inline Bun/Python code. Acceptable, though the two batch-extraction code
  blocks (Phase 5) are the kind of content `references/` is for; depth is otherwise
  well-routed (auth → `references/browser-auth.md`).
- Browser usage (`headless: false`, Playwright) doesn't mention the
  `profile="openclaw"` convention from the rubric's built-in-tools table. Minor; the
  skill leans on raw Playwright/curl rather than the `browser` tool, which is a
  reasonable choice for a scraping pipeline.

**Strengths** — Excellent end-to-end pipeline with strong "why" at every phase (the
raw-HTML cache rationale, "cheapest approach that works," canary-before-batch). Honest
demonstration-mode note. Clear Phase 6 output format. The `references/browser-auth.md`
split (new since loop-018) is correct progressive disclosure.

**Recommendations**
- Trim the description below 160B and quote it; drop the em dash. Example (150B):
  `"Extract structured data from any website: browser exploration, DOM signal detection, HTTP batch extraction, auth, and reporting. Use to scrape or crawl a site."`
- Optionally move the Phase 5 code blocks into a `references/extraction-patterns.md`.

---

## Priority Fix List (highest leverage first)

1. **tts gating → single-line JSON + add `bun` bin** (`tts/SKILL.md:4-10`).
   A skill with real API-key dependencies whose gate likely doesn't parse. Fixing
   this makes the gate actually hide the skill when keys are absent — the whole point
   of gating. *Major, isolated, high leverage.*

2. **product-manager namespace `clawdbot` → `openclaw`** (`product-manager/SKILL.md:4`).
   One-token fix that turns an inert gate into a working one. *Major, trivial.*

3. **Fix the 5 over-cap descriptions** — adhd (640B), specdocs (305B), humanizer
   (303B), scripting (281B), web-scraping (175B). These skills **cannot deploy** via
   `skill_workshop` as written. Convert humanizer/specdocs off block scalars to
   single-line. *Critical for deployability; mechanical.*

4. **Quote all unquoted descriptions** — adhd, product-manager, scripting, tts,
   web-scraping. *Minor, do it alongside #3.*

5. **product-manager content + trigger clause** — add a "use when…" clause and either
   add a real workflow or justify the skill against "don't encode what the base model
   knows." *Major; the only skill with a substance-level concern.*

6. **Adopt `{baseDir}` for script paths** across adhd, cc-dispatch, tts (and have
   `scripting` model the rule). Systemic; batch it. *Minor but corpus-wide.*

7. **product-manager `name` → kebab-case** (`Product Manager` → `product-manager`).
   *Minor consistency fix.*

---

## Method Notes

- Byte counts measured on the decoded description value (UTF-8), per
  `description-guide.md` ("Count bytes, not characters"). Block-scalar values were
  folded to a single logical line before measuring, matching how the field would be
  consumed.
- "Quoted / single-line / namespace" checks read directly from frontmatter.
- `{baseDir}` usage verified by grep across all 10 `SKILL.md` files: zero matches.
- No file under `skills/` was modified. Findings trace only to the four provided
  rubric files; no external criteria were introduced.
