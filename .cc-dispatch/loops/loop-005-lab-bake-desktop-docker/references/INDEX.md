# references/ — loop-005 lab-layer bake (desktop + Docker)

CC starts cold and cannot reach Notion. These files are the full context.

| File | What it is | Why CC needs it |
|------|-----------|-----------------|
| `prd-lab-infrastructure.md` | Canonical PRD-001 v1.1 (Notion). FR-3 (Docker/SonarQube/Postgres) and FR-4 (browser desktop with per-student auth) are this loop's targets. | The authoritative requirements for the desktop + Docker layer. |
| `loop-004-divergence-map.md` | The reconciliation report. Part A rows for FR-3/FR-4, Part B contradictions, Part C Path 2 (the chosen direction). | Tells CC exactly what's absent vs present so it builds the gap, not duplicates. |
| `current-repo-state.md` | Repo snapshot (bootstrap.sh, terraform, cloud-init, instances.txt) as of loop-003. | The base image this loop extends. CC adds to `bootstrap.sh`, doesn't rewrite it. |
| `research-browser-desktop.md` | Research brief comparing noVNC / Kasm / Guacamole / Xpra for the "provision N creds, student opens URL, logs in, sees desktop" workflow. | Justifies the noVNC + nginx-basic-auth choice; lists auth options + failure modes. |
| `research-browser-only-vps-access.md` | Deep research on browser-only VPS access methods (44k chars). | Reference for auth patterns, HTTPS fronting, and known gotchas if the noVNC default needs detail. |

## Decisions already locked (Cedric, 2026-06-19) — do NOT re-litigate

- **Desktop IS in scope.** Stack: **Xfce + noVNC (via websockify) + nginx basic-auth**, per-student username/password, baked into the golden image. (PRD D2 default; Kasm/Guacamole rejected as too heavy/centralized for a per-instance model.)
- **Docker stack IS in scope.** Docker CE + SonarQube CE + Postgres as managed containers; the agent user (`ubuntu`, per repo D3) in the `docker` group.
- **Instance is `ccx33`** (8 dedicated vCPU / 32GB / 240GB) — plenty for desktop + Docker; the PRD's "CCX43" label is a known doc bug.
- **Path 2 (hybrid):** keep Terraform + the bash golden-snapshot bake; this loop EXTENDS `dotfiles/bootstrap.sh`, it does not introduce Ansible.
- **Funnel verification happens later on the live box**, not in this loop. This loop is file-editing + static checks only.

## Framing

This loop adds the two heaviest lab-layer pieces (desktop + Docker) to the existing
bash bake, because those are the expensive bake-once-snapshot work. Per-instance
wiring (credentials, personas, Discord, Funnel) comes in later loops. Keep the bake
idempotent and readable (attendees may open it).
