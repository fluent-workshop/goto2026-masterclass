# Skill Audit Goal

## Objective
Perform a blind code review of the 9 masterclass skills to ensure they align with the best practices defined in the `skill-creator` guidelines.

## Scope
Audit the following skills in `/Users/openclaw/src/spantree/goto-2026-masterclass/skills/`:
1. adhd
2. cc-dispatch
3. code-review
4. grill-me
5. humanizer
6. product-manager
7. scripting
8. specdocs
9. web-scraping

Do NOT review `skill-creator` itself (it's the rubric).

## Review Criteria (The Rubric)
For each skill, evaluate against the rules in `references/skill-creator-SKILL.md` and its companion docs:

1. **Description Quality (`description-guide.md`)**:
   - Is it ≤ 160 bytes?
   - Does it explicitly state *when* to use it with trigger phrases?
   - Is it concrete?

2. **Gating (`gating.md`)**:
   - Are there hidden dependencies (binaries, API keys) that should be explicitly gated in `metadata.openclaw`?

3. **Progressive Disclosure**:
   - Is the main `SKILL.md` body lean (under 500 lines)?
   - Are detailed schemas, long examples, and deep instructions pushed to `references/`?
   - Are scripts used for deterministic/repetitive operations (`scripting.md`)?

4. **Writing Style & Mechanics**:
   - Is it written in imperative form ("Fetch the URL", not "You should fetch")?
   - Does it explain the *why* alongside the *what*?
   - Does it correctly reference built-in tools (like `exec`, `web_search`, `cron`, etc.) instead of vague workflow descriptions?
   - Does it avoid anti-patterns (no `exec sleep`, no direct `Write`/`Edit` for SKILL.md updates)?

## Output
Produce a single `report.md` file in the loop folder containing:
1. An executive summary of the overall health of the skill ecosystem.
2. A per-skill section detailing:
   - **Score**: [Pass / Needs Polish / Major Rewrite]
   - **Findings**: Specific violations or areas for improvement against the rubric.
   - **Recommendations**: Concrete fixes to apply.

## Rules
- Do NOT modify the skills directly. This is a read-only audit.
- Do NOT collaborate. This is a blind review. You are one of two independent reviewers.
- Base all critiques strictly on the provided `skill-creator` guidelines. Do not invent criteria outside the rubric.