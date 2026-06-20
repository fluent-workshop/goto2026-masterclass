# Loop 006 report — box #1 first live bake + verify

**Mode:** live execution on the throwaway box #1 (`goto-test`, ccx33,
`87.99.153.105`, Ubuntu 24.04.4, 8 vCPU / 30 GiB). First time the lab bake recipe
(`dotfiles/bootstrap.sh` + `dotfiles/desktop/` + `infra/services/`) has ever run
on real hardware — it was only statically validated in loop-005. Every fix was
made in the **repo** and re-run, not hand-patched on the box. No snapshot taken
(human-gated next step).

## Snapshot-readiness verdict: ✅ GREEN — recipe is snapshot-ready

The committed recipe bakes to green from a clean sync, is idempotent on re-run,
and the full desktop chain + Docker stack come up and pass their acceptance bars
on real hardware. **The image can be snapshotted and cloned** once the two
out-of-scope wiring items below are addressed (neither is a recipe defect; both
are later-loop work the PRD already schedules):

1. **Tailscale auth key (FR-5)** — no student-instance auth key exists yet (only
   GKE OAuth tokens in 1Password). Funnel could not be exercised. The PRD's
   documented direct-IP Wi-Fi fallback was verified end-to-end instead. **Cedric
   needs to mint a Tailscale auth key** (reusable/ephemeral, tagged for the lab)
   before the Funnel loop can complete FR-5.
2. **cloud-init `desktop.env` injection (FR-4 wiring)** — the per-student
   basic-auth credential is consumed correctly by the baked first-boot unit
   (verified with a throwaway cred), but the cloud-init `write_files` block that
   drops `/etc/openclaw/desktop.env` per instance is still a later loop.

Until #2 lands, a cloned box is **fail-closed** (nginx returns 401, no anonymous
desktop) — which is the safe default, not a blocker for snapshotting.

---

## 1. What broke on the first live run, and the recipe fix for each

Five defects that static validation could not catch. All fixed in the repo and
re-verified by re-baking.

| #   | Symptom on box #1                                                                                     | Root cause                                                                                                                                                                                                                                                                                                      | Fix (committed)                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bake aborted at the §10 resolution gate: `npm` exited 126 (`/usr/bin/env: 'bash': Permission denied`) | Gate ran `env -i /bin/sh -c …` with a **completely empty** environment. `node`/`openclaw` shims are the mise ELF binary (exec'd directly) and survive; `npm` chains through a `#!/usr/bin/env bash` wrapper whose shebang needs `PATH` _in the environment_ to find bash. No real launcher ships an empty PATH. | Give the gate systemd's `DefaultEnvironment` PATH (HOME still unset to keep asserting mise's passwd-tree lookup). `/usr/local/bin` is the only source of these tools on that PATH, so shim wiring stays under test. `71f5e76` |
| 2   | `openclaw` reinstalled over the network on **every** bake (not idempotent)                            | Version guard compared `$NF` of `openclaw --version`, but the binary prints `OpenClaw 2026.6.5 (5181e4f)` — `$NF` is the git hash, never the pin.                                                                                                                                                               | Extract the first semver token instead; re-runs now skip. `71f5e76`                                                                                                                                                           |
| 3   | nginx "active" but **not listening on :8080**; `curl :8080` refused                                   | The bake only `enable`d nginx. The daemon `apt` started at install time (stock config, :80 only) kept running and never bound our site; nginx was never reloaded after the site was written.                                                                                                                    | `systemctl restart nginx` after writing the site (fails closed with no htpasswd, so starting it exposes nothing). `30f4f33`                                                                                                   |
| 4   | `/` served an **unauthenticated 302** (fail-open) instead of 401                                      | `location = / { return 302 … }` runs in nginx's _rewrite_ phase, **before** the _access_ phase enforces `auth_basic`. (`/vnc.html` and the WebSocket were correctly 401 — only the bare redirect leaked.)                                                                                                       | Serve an auth-gated **static** landing page (content phase ⇒ basic-auth applies ⇒ `/` is 401 until creds exist) that JS-redirects into noVNC with the autoconnect params. New asset `dotfiles/desktop/index.html`. `30f4f33`  |
| 5   | SonarQube container **never reported healthy** (FailingStreak climbing) despite the API being UP      | Healthcheck probed `/api/system/status` with `wget --spider` (HEAD); the API only answers GET, so every probe was a "broken link". Would eventually flip the container to _unhealthy_.                                                                                                                          | GET that matches `"status":"UP"` in the JSON body. `2b62ab1`                                                                                                                                                                  |

Defects #1, #3, #4, #5 are classic "only fails on a live box" issues (process
exec semantics, daemon lifecycle, nginx phase ordering, real HTTP verbs) — they
are exactly what this loop existed to catch.

---

## 2. Final green state (evidence)

**Bake:** `bash dotfiles/bootstrap.sh` → exit 0, idempotent. Re-run skips mise,
openclaw, Docker install, and docker-group add; the §10 verify passes:

```
==> Verifying non-login resolution (systemd-like env, as ubuntu)
v22.23.0
10.9.8
OpenClaw 2026.6.5 (5181e4f)
==> Validating nginx config (nginx -t)   → syntax ok / test successful
==> Validating compose syntax (config only, no pull/up)
==> Confirming lab units are enabled     → enabled ×5
```

**Desktop chain (FR-4)** — `browser → nginx:8080 (basic-auth) → websockify:6080 →
TigerVNC:1/5901 → Xfce`:

| Check                                         | Result                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `nginx -t`                                    | ✅ ok                                                                                                             |
| Ports                                         | `0.0.0.0:8080` (public) + `127.0.0.1:6080`, `127.0.0.1:5901` (loopback) ✅                                        |
| `/` with no creds                             | **401** (fail-closed) ✅                                                                                          |
| `/vnc.html`, `/websockify` with no creds      | **401** ✅                                                                                                        |
| `/` with test cred                            | 200 landing → JS-redirects to `/vnc.html?autoconnect=true&resize=remote` ✅                                       |
| `/` with wrong cred                           | 401 ✅                                                                                                            |
| `/vnc.html` + assets (`/app/ui.js`) with cred | 200 (proxied) ✅                                                                                                  |
| WebSocket upgrade through nginx with cred     | **101 Switching Protocols**, valid `Sec-WebSocket-Accept` ✅                                                      |
| WebSocket upgrade with wrong cred             | 401 ✅                                                                                                            |
| Xfce session live                             | `xfce4-session` + `dbus-launch` running; `Xtigervnc :1` on loopback 5901, `SecurityTypes None`, 1920×1080 ✅      |
| First-boot cred unit                          | `openclaw-desktop-cred.service` reads `/etc/openclaw/desktop.env`, writes bcrypt htpasswd (root:www-data 0640) ✅ |

The per-instance credential mechanism was exercised with a **throwaway** test
password that lived on the box only and has been removed; the box is back to
fail-closed (`/` = 401). No test secret was committed.

**Docker stack (FR-3):**

| Check                                                                  | Result                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Brought up via the **baked** `openclaw-services.service` (not by hand) | ✅                                                                    |
| `openclaw-lab-db-1`                                                    | **healthy** (postgres:16.4-bookworm, 617 MB image)                    |
| `openclaw-lab-sonarqube-1`                                             | **healthy** (sonarqube:10.6.0-community → 10.6.0.92116, status UP)    |
| SonarQube port                                                         | `127.0.0.1:9000` only (loopback) ✅                                   |
| `vm.max_map_count`                                                     | `262144` (sysctl applied; ES bootstrap checks passed, no bootloop) ✅ |
| `.env` (internal DB password)                                          | auto-generated on box, root-only 0600, never committed/baked ✅       |
| `ubuntu` runs `docker ps` without sudo                                 | ✅ (in `docker` group; verified in a fresh `su - ubuntu` login)       |

---

## 3. Funnel result (FR-5) — BLOCKED on auth key, direct-IP verified

- **Funnel: not exercised.** Tailscale is not installed (FR-5 is a later loop)
  and **no student-instance auth key is available** — only GKE OAuth tokens in
  1Password. Not faked.
- **Direct-IP fallback: verified over the public internet** (`87.99.153.105:8080`,
  the PRD's documented conference-Wi-Fi fallback):
  - no creds → **401** (fail-closed across the internet; the port is open)
  - test cred → **200** landing; `/vnc.html` → **200** noVNC client.

**Action for Cedric:** mint a Tailscale auth key (reusable or ephemeral, tagged
for the lab nodes) so the FR-5 loop can `tailscale up` + `tailscale funnel 8080`
and verify the HTTPS desktop URL — the gate you wanted before snapshot.

---

## 4. Headroom observed on ccx33 (with the full stack running)

- **Memory:** 2.7 GiB used / **27 GiB available** of 30 GiB. SonarQube 1.5 GiB /
  4 GiB cap, Postgres 54 MiB / 1 GiB cap. Leaves well over the NFR's ≥20 GiB for
  OpenClaw + workloads. (Hetzner ccx33 is nominally 32 GB; the OS reports 30 GiB
  usable — note the earlier "32 GB" figure is the marketing number.)
- **Disk:** 7.8 GiB used / **209 GiB free** of 225 GiB (includes the pulled
  SonarQube + Postgres images: 1.92 GB + 617 MB). Ample for the snapshot.
- **CPU:** 8 vCPU, load ~0.5 at idle-with-stack-healthy.

---

## 5. Commits (all recipe fixes, scope `infra`)

- `71f5e76` — make bake green + idempotent on first live box (fixes #1, #2)
- `30f4f33` — make desktop fail-closed + nginx adopt config at bake (fixes #3, #4)
- `2b62ab1` — use GET for SonarQube healthcheck, not HEAD (fix #5)

## 6. Out of scope this loop (later, gated)

- cloud-init `desktop.env` injection + `infra/clone.sh` substitution (FR-4 wiring).
- Tailscale join + Funnel publish + HTTPS verification (FR-5) — **needs the auth
  key above**.
- Service credential bag, personas, Discord (deferred), QR delivery.
- The actual snapshot → 14-clone run (human-gated, AFTER this green verdict).

## 7. Box state at hand-off

Box #1 is left **running** with the final committed recipe baked, the desktop
chain active (fail-closed, no creds), and the Docker stack healthy — ready for a
human to inspect and snapshot. Test credentials removed. Cost ~€0.27/hr while
alive; destroy or snapshot at will.
