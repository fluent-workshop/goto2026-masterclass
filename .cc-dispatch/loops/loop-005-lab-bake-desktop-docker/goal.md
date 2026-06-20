# Loop 005 — Lab-layer bake: browser desktop + Docker stack (FILE EDITING ONLY)

## Context

The GOTO 2026 masterclass needs a **full graphical lab** per student, not the lean
headless box the repo currently bakes (see `references/loop-004-divergence-map.md`).
Cedric chose **Path 2** (hybrid): keep Terraform + the bash golden-snapshot bake,
and EXTEND it with the lab layer. This loop adds the two heaviest pieces — the
**browser desktop (FR-4)** and the **Docker service stack (FR-3)** — to
`dotfiles/bootstrap.sh`, because those are the expensive bake-once-then-snapshot
work. Per-instance wiring (credentials, personas, Discord, Funnel) is later loops.

**This loop is file-editing + static validation ONLY. No cloud resources, no
Terraform apply, no SSH, no Docker pulls, no spend.** There is no live box yet; you
cannot run any of this. You write the recipe and statically validate it; a human
runs it on the first Hetzner box (a later, gated step) where Funnel + desktop get
verified before snapshot.

## READ FIRST (you start cold — read all of it)

- `references/INDEX.md` — then every file it lists, especially:
  - `references/prd-lab-infrastructure.md` — FR-3 + FR-4 are the authoritative reqs.
  - `references/loop-004-divergence-map.md` — what's absent vs present; Path 2.
  - `references/current-repo-state.md` — the current `bootstrap.sh` you extend.
  - `references/research-browser-desktop.md` — the noVNC vs alternatives analysis.

## Locked decisions (do NOT re-litigate — from Cedric 2026-06-19)

- Desktop stack: **Xfce + noVNC (websockify) + nginx basic-auth**, per-student
  user/password, baked in. NOT Kasm/Guacamole.
- Docker: **Docker CE + SonarQube CE + Postgres** as containers; agent user `ubuntu`
  in the `docker` group.
- Extend the existing **bash** bake; do NOT introduce Ansible. Keep it idempotent
  and readable.
- Agent user is `ubuntu` (repo D3). Anthropic keys are org sub-keys (later loop).

## Phases

### F1 — Desktop stack in the bake (FR-4)
Add a section to `dotfiles/bootstrap.sh` (or a sourced `dotfiles/lib/` module if you
keep it modular — match the existing structure) that installs and configures:
- **Xfce4** (core, minimal — no full desktop bloat; xfce4 + xfce4-terminal + a file
  manager is enough). Headless-friendly.
- **TigerVNC** (or x11vnc) serving the Xfce session on a local display.
- **noVNC + websockify** translating VNC → browser WebSocket.
- **nginx** as an HTTPS reverse proxy in front of noVNC with **HTTP basic auth**
  (htpasswd), so a student hits the URL and must enter their per-student
  username/password before reaching the desktop.
- Wire it so the desktop is reachable at a stable path that the **Tailscale Funnel**
  URL will later front (the Funnel/tailnet setup itself is a LATER loop — here just
  make the local nginx→noVNC→Xfce chain correct and document the Funnel hook point).
- The per-student username/password is a **per-instance** value: do NOT hardcode a
  credential. Parameterize it (env var / placeholder consumed at clone time via
  cloud-init) and document where the real value gets injected later. NO real secrets
  in any file.

Key correctness target (the thing a human will verify on the box): after the bake,
the desktop chain comes up on boot and nginx demands basic-auth before noVNC loads.

### F2 — Docker service stack in the bake (FR-3)
Add a section that:
- Installs **Docker CE** (official Docker apt repo, pinned/idempotent) + the compose
  plugin.
- Adds the agent user (`ubuntu`) to the `docker` group so the agent runs containers
  without sudo (this is intentional per PRD FR-3 security note — single-student box).
- Defines **SonarQube CE** and **Postgres** as managed containers — prefer a small
  `docker-compose.yml` baked into the image (e.g. `infra/services/compose.yml` or a
  path under the agent's workspace) with pinned image tags, sane memory limits
  (PRD NFR: SonarQube+Postgres ≤ 5GB), and a healthcheck. Do NOT start/pull at bake
  authoring time — you can't; just lay down the compose file + a systemd unit or a
  first-boot hook that brings them up on the real box.
- SonarQube needs specific kernel sysctl (`vm.max_map_count=262144`) — bake that in
  (`/etc/sysctl.d/`) or it won't start. This is a classic failure mode; handle it.

### F3 — Idempotence + ordering pass
- Every step guards on "already present" (apt installs, group membership, htpasswd,
  docker repo, sysctl). Re-running the whole bake changes nothing and errors nowhere.
- Mind ordering against the existing mise/openclaw sections — desktop + Docker are
  additive; don't break the loop-003 hardening (pinned mise/node, the `env -i`
  resolution gate, the `curl|bash` FATAL guard).

### F4 — Static validation + report
- `bash -n dotfiles/bootstrap.sh` and `shellcheck` (clean or documented).
- If you add a compose file: `docker compose -f <file> config` IF docker is available
  in the sandbox to validate syntax; if not, validate the YAML with a parser and say
  so. Do NOT `docker compose up` / pull images.
- Validate any nginx config you write with `nginx -t` IF nginx is installed; else a
  careful manual check + note.
- Write `report.md`: what was added (FR-3/FR-4 map to file:line), the desktop chain
  (Xfce→VNC→noVNC→nginx-auth) and where the per-student credential + Funnel URL get
  injected later, the Docker/compose layout + the sysctl fix, every assumption
  flagged, and the exact commands a human runs on the first Hetzner box to verify
  (desktop loads with auth; `docker ps` shows sonarqube+postgres healthy).

## Acceptance criteria (gradeable)

- `bash -n dotfiles/bootstrap.sh` passes; shellcheck clean or documented.
- Desktop chain (Xfce + VNC + noVNC + websockify + nginx basic-auth) fully scripted
  in the bake, idempotent, with the per-student credential parameterized (no
  hardcoded secret) and the Funnel hook point documented.
- Docker CE + a pinned-tag compose for SonarQube CE + Postgres laid down, agent user
  in `docker` group, `vm.max_map_count` sysctl baked, brought up via a first-boot
  hook/systemd unit (NOT at bake-author time).
- Loop-003 hardening still intact (no regressions to the mise/openclaw/resolution
  work).
- `report.md` written with the FR→file:line map, the later-injection hook points,
  and the human verification commands.
- `git status`: only `dotfiles/` (+ any new `infra/services/` compose) and the
  loop-005 dir changed. No Terraform/cloud-init behavioral change required here
  (cloud-init credential injection is a later loop), no secrets committed.

## Safety rules

- **No cloud resources, no Terraform, no SSH, no docker pull/up, no spend.** Pure
  file editing + static checks. There is no live box.
- **No real secrets.** The per-student desktop password and any keys are
  placeholders/parameters injected later via cloud-init.
- Do NOT introduce Ansible (Path 2 keeps bash). Do NOT regress loop-003.
- Conventional commits, scope `infra`; reference FR-3/FR-4 in commit bodies
  (e.g. `feat(infra): bake Xfce+noVNC browser desktop with nginx auth (FR-4)`).
- Stop after F4 + report. Do NOT apply/bake/snapshot — human-gated later.
