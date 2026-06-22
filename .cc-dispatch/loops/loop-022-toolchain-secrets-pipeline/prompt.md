Wire the full secrets pipeline, migrate instance roster to TOML, and expand the student toolchain so a pikachu cloud-init renders cleanly with every key and tool a student needs.

READ FIRST:
- `.cc-dispatch/loops/loop-022-toolchain-secrets-pipeline/goal.md` — full spec (F1–F6 + green gate).
- `.cc-dispatch/loops/loop-022-toolchain-secrets-pipeline/references/` — INDEX.md, then everything it lists.
- Key source files: `infra/clone.sh`, `infra/cloud-init/template.yaml`, `dotfiles/bootstrap.sh`, `dotfiles/bin/goto2026-sync`, `dotfiles/mise.toml`.

Mode: autonomous (--dangerously-skip-permissions), work directly on `main` in `~/src/fluent-workshop/goto2026-masterclass`.
Do NOT touch `instance-secrets.toml`, `.envrc.local`, or any gitignored generated files.

Done when: all six green-gate checks pass (G1–G6 from goal.md) and are shown in the transcript; all F-items committed with F-number in commit message; `report.md` lists every F-item's status — or stop after 50 turns and report what's blocking.

Stop after the gate passes: write `report.md`, commit, push. Do not begin provisioning.
