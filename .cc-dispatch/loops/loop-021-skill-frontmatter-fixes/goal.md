# Goal — loop-021-skill-frontmatter-fixes

## Context

Two consecutive blind audits (loop-018, loop-020) identified a consistent set of mechanical and structural defects across the masterclass skills in `skills/`. The bodies are high-quality; the gaps are almost entirely in frontmatter mechanics and script-path conventions. All fixes share the same verification surface (grep/byte-count) and belong in one loop.

`skill-creator` is the rubric — do NOT modify it.

---

## Review-Sourced Fixes

### RS1 — tts: gating format broken

**Evidence:** `audit-loop020-report.md` §9 — `metadata.openclaw` written as multi-line YAML; `gating.md` requires single-line JSON. Gate almost certainly doesn't parse → skill with real `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID` deps shows up ungated.

**Fix:** Rewrite the frontmatter `metadata` block as a single-line JSON string, add `"bins": ["bun"]` to `requires`:

```
metadata: {"openclaw": {"requires": {"bins": ["bun"], "env": ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]}, "primaryEnv": "ELEVENLABS_API_KEY"}}
```

Also quote the description (currently unquoted — see RS4).

**File:** `skills/tts/SKILL.md`

---

### RS2 — product-manager: wrong namespace + name + missing trigger clause

**Evidence:** `audit-loop020-report.md` §6 — `metadata: {"clawdbot":{...}}` → gate is inert. Name is `Product Manager` (title-case with space) rather than `product-manager`. Description has no "use when" trigger clause.

**Fixes (three in one commit):**
1. Rename `metadata.clawdbot` → `metadata.openclaw`. Keep the OS content (or drop the gate entirely — there are no real binary deps; up to you, but correct the namespace if keeping it).
2. Fix `name: Product Manager` → `name: product-manager`.
3. Quote the description and add a trigger clause. Keep it ≤160 bytes. Example: `"Product discovery, prioritization, and roadmapping guidance. Use when scoping a product decision, writing a roadmap, or prioritizing a backlog."`

**File:** `skills/product-manager/SKILL.md`

---

### RS3 — Five over-cap descriptions (blocking deployability)

**Evidence:** `audit-loop020-report.md` Executive Summary — these five descriptions exceed the 160-byte hard cap and would be rejected outright by `skill_workshop`. Two also use block scalars (`>`) which the single-line parser rejects.

Work through each in turn. For each:
- Collapse to a single quoted line ≤160 bytes
- Include a "use when…" trigger clause
- Preserve the core capability signal

| Skill | Current bytes | File |
|---|---|---|
| adhd | 640 | `skills/adhd/SKILL.md` |
| specdocs | 305 (block scalar) | `skills/specdocs/SKILL.md` |
| humanizer | 303 (block scalar) | `skills/humanizer/SKILL.md` |
| scripting | 281 | `skills/scripting/SKILL.md` |
| web-scraping | 175 | `skills/web-scraping/SKILL.md` |

Suggested rewrites (verify bytes before committing):
- **adhd** (target ≤160B): `"Parallel divergent ideation for hard open-ended decisions — fans out isolated grounded CC frames, then critiques. Use on /adhd or open-ended design."`
- **specdocs** (target ≤160B): `"Draft PRDs (15-section) and ADRs (MADR 4.0) from templates. Use when writing, drafting, or reviewing a PRD/ADR, scoping a feature, or documenting a decision."`
- **humanizer** (target ≤160B): `"Remove signs of AI-generated writing. Use when asked to humanize, de-slop, or make text sound human; catches 27+ AI writing patterns."`
- **scripting** (target ≤160B): `"Conventions for Bun+TypeScript (and Python) CLI scripts in skills. Use when writing, refactoring, or reviewing skill scripts or CLI helper code."`
- **web-scraping** (target ≤155B): `"Extract structured data from any site: browser recon then HTTP batch. Use when asked to scrape, crawl, or download data from a URL."`

Do NOT blindly paste these — measure the bytes first and adjust if needed. The rule is hard: >160 bytes = rejected.

---

### RS4 — Unquoted descriptions

**Evidence:** `audit-loop020-report.md` §5 — these descriptions are syntactically unquoted plain scalars; `description-guide.md` requires `description: "..."` always.

| Skill | File |
|---|---|
| adhd | `skills/adhd/SKILL.md` |
| product-manager | `skills/product-manager/SKILL.md` (also RS2) |
| scripting | `skills/scripting/SKILL.md` (also RS3) |
| tts | `skills/tts/SKILL.md` (also RS1) |
| web-scraping | `skills/web-scraping/SKILL.md` (also RS3) |

Most are already handled as part of RS1/RS2/RS3 rewrites. Do a final pass to confirm every description field across all 10 skills is `description: "..."`.

---

### RS5 — `{baseDir}` script paths (systemic)

**Evidence:** `audit-loop020-report.md` §Method Notes — grep across all 10 SKILL.md files shows zero uses of `{baseDir}`. Every skill that references a script hardcodes `skills/<name>/scripts/...`. `scripting.md` mandates `{baseDir}/scripts/...`.

Affected skills (confirmed by audit, have script invocations in body):
- `skills/adhd/SKILL.md` — `skills/adhd/scripts/adhd.ts`
- `skills/cc-dispatch/SKILL.md` — `CC=skills/cc-dispatch/scripts/cc-dispatch.ts`
- `skills/tts/SKILL.md` — `bun run skills/tts/scripts/tts.ts`
- `skills/scripting/SKILL.md` — cross-skill paths; add a `{baseDir}` example section since this skill teaches the convention
- `skills/code-review/SKILL.md` — cross-skill paths (softer; harder to use `{baseDir}` for other skills' paths — do a best-effort pass)

**Fix:** Replace `skills/<name>/scripts/` with `{baseDir}/scripts/` in the body. For `cc-dispatch`, change `CC=skills/cc-dispatch/...` → `CC={baseDir}/scripts/...`. For `scripting`, add a brief `{baseDir}` demonstration alongside the existing path examples.

---

### RS6 — product-manager body: add workflow or justify

**Evidence:** `audit-loop020-report.md` §6 — body is 9 lines of generic PM maxims with no workflow, no tool references, no output format. Auditor flagged it as encoding what the base model already knows.

**Fix options (pick one — prefer A):**
- **A (preferred):** Add a lightweight repeatable workflow — e.g. a discovery → prioritization → roadmap skeleton with OpenClaw tool references (which tools the agent should use for each phase). Keep it under 100 lines total.
- **B:** If the skill is intentionally a principles-only reference, add a comment/note in the body explaining why it earns per-turn token cost. This is the weaker answer.

---

## Green Gate

The loop is done when ALL of the following greps/checks pass and are reported in the transcript:

```bash
# G1 — No over-cap descriptions (all ≤160 bytes)
python3 -c "
import re, yaml, sys
failures = []
import os
for d in os.listdir('skills'):
    p = f'skills/{d}/SKILL.md'
    if not os.path.exists(p): continue
    if d == 'skill-creator': continue
    text = open(p).read()
    m = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not m: continue
    fm = yaml.safe_load(m.group(1))
    desc = fm.get('description', '')
    b = len(str(desc).encode('utf-8'))
    if b > 160: failures.append(f'{d}: {b}B')
if failures: sys.exit('\n'.join(failures))
print('All descriptions ≤160 bytes')
"

# G2 — No block scalars in descriptions
grep -rn "^description: >" skills/*/SKILL.md && echo "FAIL: block scalars found" || echo "No block scalars"

# G3 — No unquoted descriptions
grep -rn "^description: [^\"]" skills/*/SKILL.md && echo "FAIL: unquoted descriptions" || echo "All descriptions quoted"

# G4 — No clawdbot namespace
grep -rn "clawdbot" skills/*/SKILL.md && echo "FAIL: clawdbot found" || echo "No clawdbot"

# G5 — tts metadata is single-line JSON
python3 -c "
import re, json
text = open('skills/tts/SKILL.md').read()
m = re.search(r'^metadata:\s*(.+)$', text, re.MULTILINE)
if not m: exit('FAIL: no metadata line')
try: json.loads(m.group(1))
except: exit(f'FAIL: not valid JSON: {m.group(1)[:80]}')
print('tts metadata: valid single-line JSON')
"

# G6 — No hardcoded skill script paths (excluding cross-skill refs in code-review)
grep -rn 'skills/[a-z_-]*/scripts/' skills/adhd/SKILL.md skills/cc-dispatch/SKILL.md skills/tts/SKILL.md skills/scripting/SKILL.md \
  && echo "FAIL: hardcoded paths remain" || echo "No hardcoded paths in targeted skills"
```

All six checks must pass and appear in the transcript. Commit each RS fix separately, referencing the RS number in the commit message.

---

## Safety Rules

- Do NOT modify `skills/skill-creator/` — it is the rubric source and is explicitly out of scope.
- Do NOT modify any files under `scripts/` or `references/` within the skills — SKILL.md only for all RS fixes.
- Do NOT rewrite skill bodies beyond the minimum required for RS5 ({baseDir}) and RS6 (product-manager workflow). Preserve existing body content.
- Do NOT commit anything outside `skills/`.
