# Loop 006 — Box #1 live bake + verify (FIRST live execution)

## Context

Box #1 (`goto-test`, ccx33, `87.99.153.105`) is live and SSH-reachable. The full
lab bake recipe (`dotfiles/bootstrap.sh` + `dotfiles/desktop/` + `infra/services/`)
was authored and statically validated in loop-005 but has **never run on a real
box**. This loop is its first live execution: run the bake, fix whatever breaks,
and verify the desktop + Docker stack come up — so we know the recipe is sound
before we snapshot and clone 14.

**This is a THROWAWAY box.** Break it, re-run, fix freely. SSH as root:
`ssh -i ~/.ssh/id_ed25519 root@87.99.153.105`. Iterate directly on the box; when
you find a bug in the recipe, **fix it in the repo's `dotfiles/` AND re-run** so the
committed recipe is what actually worked — the snapshot must come from the real
recipe, not hand-patches that live only on the box.

## READ FIRST (you start cold)

- `references/INDEX.md` → then `references/loop-005-bake-report.md` (the recipe +
  its intended verify commands + the desktop architecture) and
  `references/prd-lab-infrastructure.md` (FR-2/3/4/5 acceptance bars).

## Scope & boundaries

- **In scope:** SSH to box #1, run the bake, debug failures, fix the repo recipe,
  re-run to green, verify desktop + Docker, write the verification report.
- **Out of scope:** Terraform (box already exists — do NOT destroy/recreate it),
  the 14-clone, cloud-init credential injection, personas, **Discord (deferred)**,
  and snapshotting (that's the human-gated step AFTER this loop proves green).
- **Tailscale Funnel:** there is currently **no student-instance auth key** available
  (only GKE OAuth tokens in 1Password). So the Funnel join is **best-effort**: if you
  can obtain/are given an auth key, do it and verify the HTTPS Funnel URL; otherwise
  verify the desktop over **direct `http://87.99.153.105:8080`** (basic-auth gated,
  the PRD's documented Wi-Fi fallback) and **flag in the report that a Tailscale
  auth key is needed from Cedric** to complete FR-5. Do NOT block the whole loop on
  the missing key.

## Phases

### F1 — Run the bake
Copy the repo to the box (git clone the repo, or rsync the working tree — the bake
requires a checkout, not curl|bash, per the loop-003 FATAL guard) and run
`dotfiles/bootstrap.sh` as appropriate. Capture all output. Expect failures on the
first real run — that's the point.

### F2 — Drive it to green, fixing the RECIPE
For each failure: diagnose, fix it **in the repo** `dotfiles/...`, re-sync, re-run.
Keep the bake idempotent. Do NOT leave fixes only on the box. Known risk areas from
the report: nginx config (`nginx -t` was never run for real), the VNC→noVNC→nginx
chain wiring, Docker repo install, the SonarQube `vm.max_map_count` sysctl, the
first-boot systemd units (cred hook, compose bring-up).

### F3 — Verify the desktop (FR-4)
- The desktop chain comes up: TigerVNC :1 → websockify :6080 → nginx :8080.
- `nginx -t` passes on the box.
- Hitting `http://87.99.153.105:8080` returns **401** until a basic-auth credential
  exists (fail-closed), and **serves the noVNC client** once you set a test htpasswd
  (use a throwaway test password ON THE BOX — never commit it; the real per-student
  cred is injected later via cloud-init `desktop.env`).
- Confirm the noVNC page actually loads the Xfce session through the proxy.

### F4 — Verify the Docker stack (FR-3)
- `docker ps` shows `sonarqube` + `postgres` containers **healthy** (bring them up
  via the baked systemd unit / compose, NOT by hand-editing).
- The `ubuntu` user runs `docker ps` without sudo (docker-group membership works).
- SonarQube actually finishes booting (the `vm.max_map_count` fix is the usual
  blocker — confirm it's applied and ES doesn't bootloop). Memory stays within the
  NFR (SonarQube+Postgres ≤ ~5GB) on the 30GB box.

### F5 — Funnel (best-effort, FR-5)
- If an auth key is available: `tailscale up` with the key, `tailscale serve --bg
  8080` + `tailscale funnel 8080`, confirm the HTTPS Funnel URL fronts the desktop
  with basic-auth. **This is the gate Cedric explicitly wanted** — gateway/desktop
  reachable over Funnel HTTPS.
- If no key: verify the direct-IP path works and flag the key as needed. Do NOT fake
  a pass.

### F6 — Report
Write `report.md`: what broke on first run and the exact recipe fix for each (with
commit refs), the final green state of desktop + Docker, the Funnel result (verified
or blocked-on-key), memory/CPU headroom observed on ccx33, and a clear
**snapshot-readiness verdict** — is the recipe sound enough to snapshot + clone, or
what still needs to land first. Commit all recipe fixes (conventional commits, scope
`infra`).

## Acceptance criteria (gradeable)

- `dotfiles/bootstrap.sh` runs to green on box #1 from a clean checkout, idempotent
  on re-run, with every fix committed to the REPO (not just the box).
- Desktop verified: `nginx -t` clean, `:8080` fail-closed 401 then serves noVNC+Xfce
  with a test cred, the full chain confirmed.
- Docker verified: sonarqube + postgres healthy via the baked unit, ubuntu in docker
  group, SonarQube boots (sysctl applied), within memory budget.
- Funnel either verified over HTTPS, or the direct-IP desktop verified + the missing
  Tailscale auth key clearly flagged for Cedric.
- `report.md` written with per-failure fixes, the green state, and an explicit
  snapshot-readiness verdict — or stop after 40 turns and report what's blocking.

## Safety rules

- Do NOT destroy/recreate the box (no `terraform destroy`/`apply`). Do NOT snapshot
  (human-gated next step).
- **No secrets committed.** The test basic-auth password stays on the box only; real
  creds come via cloud-init later.
- Fix the RECIPE, not just the box — the whole point is a snapshot-able bake.
- Conventional commits, scope `infra`. Stop after F6 + report; do not snapshot or
  start the clone loop.
