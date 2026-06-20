# references/ — loop-004 PRD reconciliation

CC starts cold and cannot reach Notion. These files are the full context.

| File | What it is | Why CC needs it |
|------|-----------|-----------------|
| `prd-lab-infrastructure.md` | **The canonical spec** — PRD-001 v1.1 "Masterclass Lab Infrastructure", fetched from Notion 2026-06-19. 14 sections, 9 FRs (FR-1..FR-9), D1–D7 decisions, file breakdown, rollout, 8 open questions. | This is the source of truth the repo must be reconciled against. Everything CC asserts about "what's required" comes from here. |
| `prd-discord-architecture.md` | PRD for the Discord server architecture (per-student channels, bot apps, personas), fetched from Notion 2026-06-19. | FR-7 (personas) and the credential bag (FR-6) reference Discord bot apps + channels. Needed to assess the persona/Discord side of the gap. |
| `current-repo-state.md` | Snapshot of the repo as of loop-003: infra/dotfiles/docs file tree, terraform main.tf + variables.tf, cloud-init template, instances.txt, and the current bootstrap.sh. | The "what we have" half of the divergence map. CC diffs the PRDs against THIS, not against a fresh `find`. |
| `../../../../docs/prd/PRD-001-student-exercise-infra.md` | The **local/in-repo** PRD-001 (the lean headless version Evie wrote off a stale brief). | This is the drifted doc. CC must note where the in-repo PRD contradicts the canonical Notion PRD so we can reconcile both. |

## Key framing for CC

The repo (loops 001–003) built a **lean headless agent box**: Terraform + bash bootstrap + cloud-init, SSH-only, mise/Node/openclaw, a stripped zsh profile, 14 Pokémon-named clones. It was sized at 4GB then corrected to ccx33 (32GB).

The **canonical Notion PRD** specifies something much bigger: a **full graphical lab** — Xfce desktop + browser-accessible remote desktop (noVNC/Guacamole/Kasm TBD) with per-student auth, Docker (SonarQube CE + Postgres), a 9-key per-student credential bag via Ansible Vault, Tailscale Funnel HTTPS, 12 pre-assigned agent personas, QR-code/Gist credential delivery, and **Ansible** (not bash) as the provisioning tool (D3). Timeline: live Sat Jun 21 → conference end ~Jun 26, <$200, teardown+rotate after.

There are real, named contradictions between the two (provisioning tool: bash-vs-Ansible; agent user; SKU label CCX43-vs-ccx33; desktop required-vs-skipped). The job is to map them precisely, not to pick a winner — that's Cedric's call.
