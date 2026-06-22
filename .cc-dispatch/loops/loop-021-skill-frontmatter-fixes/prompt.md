Fix all review-sourced defects across the masterclass skills identified in the loop-020 blind audit: broken gating, over-cap descriptions, unquoted fields, wrong namespace, and missing {baseDir} paths.

READ FIRST:
- `.cc-dispatch/loops/loop-021-skill-frontmatter-fixes/goal.md` — full spec; RS-numbered fix list; green-gate greps.
- `.cc-dispatch/loops/loop-021-skill-frontmatter-fixes/references/` — INDEX.md, then all files (audit reports + rubric docs).

Mode: autonomous (`--dangerously-skip-permissions`), work directly on `main` in `~/src/fluent-workshop/goto2026-masterclass`.
Only modify `skills/*/SKILL.md` files. Do NOT touch `skills/skill-creator/`, scripts/, or references/ inside any skill.

Done when: All six green-gate checks from goal.md pass and are reported in the transcript; each RS fix is committed with its RS number in the message; report.md lists per-RS status and final grep output — or stop after 30 turns and report what's blocking.

Stop after the gate passes: write `report.md` with per-RS status + green-gate output, commit it, go idle. Do not begin the next loop.