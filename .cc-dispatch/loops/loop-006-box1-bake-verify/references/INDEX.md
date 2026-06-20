# references/ — loop-006 box #1 live bake + verify

| File | What it is | Why CC needs it |
|------|-----------|-----------------|
| `loop-005-bake-report.md` | The loop-005 report: exact files added (desktop chain + Docker compose), the verify commands, the desktop architecture diagram, the Funnel hook point, and the fail-closed credential model. | This is the recipe being run live. The "human verification on the box" section is CC's checklist. |
| `prd-lab-infrastructure.md` | Canonical PRD-001 v1.1. FR-2/FR-3/FR-4/FR-5 acceptance gherkin. | The pass/fail bar for what "verified" means. |

## Live box facts (box #1)

- **Host:** `goto-test`, Hetzner ccx33, Ubuntu 24.04.4, 8 vCPU / 30GB RAM.
- **IP:** `87.99.153.105` (Ashburn).
- **SSH:** `ssh -i ~/.ssh/id_ed25519 root@87.99.153.105` works from this host
  (key `evie-mac-mini-host` is attached). The stock `ubuntu` user also exists.
- **This is a THROWAWAY bake-test box.** It's fine to break it, re-run, and fix.
  It is NOT yet snapshotted. Cost ~€0.27/hr while alive.

## What's already done

- Terraform applied box #1 (committed `350b165`).
- The bake recipe (`dotfiles/bootstrap.sh` + `dotfiles/desktop/` + `infra/services/`)
  is written and statically validated (loop-005, committed `fc4a81e`) but has
  NEVER run on a real box. This loop is its first live execution.

## Decisions locked

- Desktop: Xfce + noVNC + nginx basic-auth. Funnel fronts nginx :8080.
- Docker: SonarQube CE + Postgres compose, ubuntu in docker group, vm.max_map_count baked.
- Funnel + gateway auth get VERIFIED here (Cedric's gate before snapshot).
- Discord is DEFERRED — not part of this loop.
