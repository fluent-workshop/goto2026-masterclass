# Loop 005 prompt — lab-layer bake: browser desktop + Docker (file editing only)

Extend the golden-image bake (`dotfiles/bootstrap.sh`) with the two heaviest lab
pieces: a **browser desktop** (Xfce + noVNC + nginx basic-auth, FR-4) and the
**Docker service stack** (Docker CE + SonarQube CE + Postgres, FR-3). Then statically
validate and STOP. **File editing + static checks only — no live box, no spend.**

READ FIRST (you start cold — read all of it):
- `.cc-dispatch/loops/loop-005-lab-bake-desktop-docker/goal.md` — full spec, phases,
  locked decisions, acceptance criteria, safety rules.
- `.cc-dispatch/loops/loop-005-lab-bake-desktop-docker/references/INDEX.md` — then
  every file it lists (canonical PRD FR-3/FR-4, the loop-004 divergence map, the
  current bootstrap.sh, the desktop research).

Mode: autonomous (`--dangerously-skip-permissions`), work in
`/Users/openclaw/src/spantree/goto-2026-masterclass` on `main`.

Locked (do NOT re-litigate): desktop stack = Xfce + noVNC(websockify) + nginx
basic-auth, per-student credential PARAMETERIZED (no hardcoded secret); Docker =
Docker CE + SonarQube CE + Postgres compose with pinned tags + `vm.max_map_count`
sysctl; agent user `ubuntu` in `docker` group; EXTEND the bash bake, NO Ansible;
do NOT regress the loop-003 mise/openclaw/resolution hardening.

OUT OF SCOPE: no Terraform, no SSH, no `docker pull`/`up`, no Funnel/tailnet setup
(later loop), no cloud-init credential injection (later loop), no real secrets, no
spend. There is no live box — you cannot run any of this; you author + statically
validate the recipe.

Done when: `bash -n dotfiles/bootstrap.sh` passes and shellcheck is clean (or
documented); the desktop chain + Docker compose stack are fully scripted, idempotent,
with the per-student password parameterized and the Funnel hook point documented;
loop-003 hardening intact; `report.md` written with the FR→file:line map, later-
injection hook points, and the human verification commands for the first Hetzner box;
`git status` shows only `dotfiles/` (+ any new `infra/services/`) and the loop-005
dir changed, no secrets committed — or stop after 30 turns and report what's blocking.

Stop after writing report.md and committing (conventional commits, scope `infra`,
referencing FR-3/FR-4). Do NOT begin the apply/bake — that's human-gated next.
