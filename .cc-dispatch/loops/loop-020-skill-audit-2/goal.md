# Goal — loop-020-skill-audit-2

## Objective

Perform a second blind audit of the masterclass skills against the skill-creator rubric. This pass includes the new `tts` skill and any changes made since the first audit. Produce a structured per-skill report suitable for comparison against the prior review.

## Scope

Audit all 10 skills in `skills/` (excluding `skill-creator`). Read-only — do NOT modify any skill files.

## Review Criteria

For each skill evaluate against `references/skill-creator-SKILL.md` and companion docs:

1. **Description quality** (`description-guide.md`): ≤160 bytes? Quoted? Single-line? Concrete with explicit "use when" trigger clause?
2. **Gating** (`gating.md`): Are real binary/env dependencies gated in `metadata.openclaw`? Wrong namespace (clawdbot vs openclaw)?
3. **Progressive disclosure**: Body under 500 lines? Deep content pushed to `references/`? Scripts used for deterministic ops?
4. **Writing style**: Imperative form? Explains why? References built-in tools by name? No `exec sleep`, no direct file writes?
5. **Script paths**: Do scripts use `{baseDir}` or hardcode paths?

## Output

Write a single `report.md` to the loop folder containing:
1. **Executive summary** — overall health, headline findings, how this pass compares structurally to the first 9-skill pass
2. **Per-skill section** for all 10 skills:
   - **Score**: Pass / Needs Polish / Major Rewrite
   - **Findings**: Specific rubric violations with line-level evidence where possible
   - **Recommendations**: Concrete fixes
3. **Priority fix list** — ordered by highest leverage

## Rules

- Do NOT modify any skill files. Read-only audit.
- Do NOT collaborate with any other reviewer. This is a blind review.
- Base all findings strictly on the provided rubric. Do not invent criteria.
- You are one of two independent reviewers. The other reviewer's output is unknown to you.
