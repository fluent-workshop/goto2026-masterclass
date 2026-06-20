# Loop 004 prompt — PRD reconciliation (analysis only)

Produce a divergence map reconciling the GOTO masterclass infra repo against the
canonical Notion PRD, plus a rescope proposal for Cedric. **Analysis only — the only
file you write is `report.md`.**

READ FIRST (you start cold — read all of it):
- `.cc-dispatch/loops/loop-004-prd-reconciliation/goal.md` — full spec + the four
  required report parts (A divergence table, B contradictions, C rescope paths, D
  open questions).
- `.cc-dispatch/loops/loop-004-prd-reconciliation/references/INDEX.md` — then every
  file it lists (the canonical PRD, the Discord PRD, the repo-state snapshot, and the
  drifted in-repo PRD).

Mode: autonomous (`--dangerously-skip-permissions`), work in
`/Users/openclaw/src/spantree/goto-2026-masterclass` on `main`.

OUT OF SCOPE — do NOT touch: `dotfiles/`, `infra/`, `docs/`, or any source file. NO
Terraform, NO hcloud, NO SSH, NO spend, NO Ansible/code authoring. The repo has
drifted from the PRD; your job is to MAP the drift, not fix it (that's a later loop
gated on Cedric's path choice).

Done when: `report.md` exists in this loop dir with all four parts — Part A divergence
table covering FR-1..FR-9 + NFRs + D1..D7 with each status (Present/Partial/Absent/
Contradicts) backed by a cited PRD section or repo file; Part B named contradictions;
Part C 2–3 rescope paths with effort/deadline-risk + a recommendation; Part D
blocking-vs-deferred open questions — and `git status` shows only `report.md` and the
`references/` folder added, no source files modified. Or stop after 25 turns and report.

Stop after writing report.md and committing it (`docs(infra): loop-004 PRD
reconciliation report`). Do NOT begin any build loop — Cedric reviews the report and
picks a path first.
