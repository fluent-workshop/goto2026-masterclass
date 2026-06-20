# Merged Review — bootstrap scripts (post-loop-007)

**Range:** `efa8561..e36d10b` (dotfiles/ infra/) · **Sources:** Codex ✅ ShellCheck ✅ CodeRabbit ✅ (0 findings) | CC blind ⬜ (not run — blocked by active dev session; low priority given Codex depth)
**Date:** 2026-06-20

CodeRabbit returned 0 findings (expected — weak on bash/YAML). ShellCheck clean. Codex ran thorough, verified against adjacent nginx/systemd/compose files.

---

## Verdict

**1 Critical, 7 Majors — fix before snapshot.** The critical is a real exposure (nginx binding). The majors split between security hardening (clone.sh injection risks) and structural concerns (monolith, idempotence gaps). The fixes are mechanical — no rethink required, just careful edits and the phase-function refactor Cedric asked for.

---

## CRITICAL

### C1 — nginx binds `:8080` on all interfaces; desktop reachable in cleartext if firewall gaps
`dotfiles/desktop/openclaw-desktop.nginx:16` — `listen 8080` with no `127.0.0.1` bind. If Hetzner's firewall doesn't block 8080, the noVNC desktop is publicly reachable without TLS. Basic Auth credentials sent over plain HTTP to any host that scans the port.
Hetzner cloud firewalls are configured separately from the instance — a misconfiguration or an operator skipping the firewall step exposes all 14 student desktops.
**Fix:** `listen 127.0.0.1:8080;` in the nginx config. Tailscale Funnel proxies localhost — this is the intended architecture anyway. Add a bake assertion: `ss -ltnp | grep 8080 | grep -v 127` should return nothing.

---

## MAJOR

### M1 — `bootstrap.sh` is a monolith; phases can't run independently
`dotfiles/bootstrap.sh:82` — 335 lines of sequential imperative code. Good section comments (`# === PHASE: TOOLCHAIN ===` etc.) exist but do nothing — a failure mid-Docker forces re-running the whole recipe from the top. Re-baking after a change to just the OpenClaw install requires watching the entire desktop + Docker chain re-execute.
**Fix:** wrap each section in a named function (`phase_base`, `phase_toolchain`, `phase_desktop`, `phase_docker`, `phase_openclaw`, `phase_verify`). Add a `--phase <name>` flag and/or stamp files (e.g., `/var/lib/bake/phase-toolchain.done`) so re-runs skip completed phases. Refactor cost: moderate — phase boundaries already exist, just need function wrapping + stamp logic.

### M2 — Hostname flows into YAML and shell commands without validation
`infra/clone.sh:159` + `infra/cloud-init/template.yaml:10` — raw `sed` substitution of `INSTANCE_NAME` into `hostnamectl set-hostname $INSTANCE_NAME` (inside a `runcmd` YAML block). A hostname with shell metacharacters or YAML-sensitive characters can break cloud-init rendering or become injection in `runcmd`.
**Fix:** validate `INSTANCE_NAME` against `^[a-z][a-z0-9-]{1,62}$` (RFC 1123) before rendering; reject anything that doesn't match. Quote the cloud-init command argument: `hostnamectl set-hostname "{{INSTANCE_NAME}}"`.

### M3 — OpenClaw API key substitution into YAML block scalar unsafe for multi-line secrets
`infra/clone.sh:160` + `infra/cloud-init/template.yaml:18` — raw sed substitution of `OPENCLAW_API_KEY` into a block scalar. A key with embedded newlines or leading YAML sigils (`{`, `|`, `>`) corrupts the rendered cloud-init silently.
**Fix:** validate no CR/LF in the key before rendering, or (better) use `encoding: b64` + base64-encode the key so the substituted value is always a single safe line.

### M4 — `DESKTOP_USER` unvalidated and shell-sourced as root
`infra/clone.sh:161` + `infra/cloud-init/template.yaml:31` — `DESKTOP_USER` substituted raw into `/etc/openclaw/desktop.env`, which is then `source`d (or equivalent) by a root-owned first-boot script. An adversarially crafted username could inject shell.
**Fix:** validate `DESKTOP_USER` against `^[a-z_][a-z0-9_-]{0,31}$` before rendering; write the env file as `KEY=value` with values quoted and stripped of special chars, rather than raw sourced.

### M5 — Stub API key is the default; passes validation while guaranteeing broken boxes
`infra/clone.sh:50,70` — `OPENCLAW_API_KEY_SOURCE=stub` is the default and renders a placeholder key that passes the placeholder-replacement check. A fleet render without setting a real key source produces 14 broken boxes with no error.
**Fix:** fail by default when `API_KEY_SOURCE=stub` and `ALLOW_STUB` is not explicitly set. Reserve stub for dev/test, not the default path.

### M6 — All boxes get the same OpenClaw API key (no per-host key support)
`infra/clone.sh:67` — `fetch_api_key` accepts `$host` but the `env` and `op` modes ignore it. Every student box gets the same credential unless the operator manually changes the env between renders.
**Fix:** support a host-keyed manifest file (`hostname → key`), or an `op://vault/{{HOSTNAME}}/field` template, or a `--key-command` hook that receives the hostname and returns the correct key.

### M7 — Docker idempotence guard is too shallow
`dotfiles/bootstrap.sh:257` — `command -v docker` as the sole guard. A partial install (docker binary present, compose plugin missing, daemon not running) passes the guard and fails later with a confusing error.
**Fix:** guard on `docker version && docker compose version` both succeeding, or check for the specific packages (`docker-ce`, `docker-compose-plugin`) and daemon availability before skipping.

### M8 — SonarQube systemd unit reports success before SonarQube is actually ready
`dotfiles/bootstrap.sh:293` — the Docker service unit starts `docker compose up -d` and immediately exits 0. SonarQube takes 60–120s to boot; the unit is "active" while SonarQube is still initializing. Lab exercises that start against SonarQube immediately after boot will fail.
**Fix:** add an `ExecStartPost` script that polls the SonarQube API (`/api/system/status`) with a bounded retry (e.g., 30 × 5s), failing the unit if it doesn't come up. Alternatively, a separate `sonarqube-ready.service` that labs depend on.

---

## MINOR

- **m1** — `dotfiles/desktop/openclaw-desktop-cred.sh:31` — `htpasswd -B` without explicit cost factor uses Apache's default (5), which is low. Use `-C 10` or `-C 12`. Tuned against login latency (~100ms at C10 on ccx33 is fine).
- **m2** — `infra/cloud-init/template.yaml:27` — `/etc/openclaw/desktop.env` persists plaintext password post-first-boot. The systemd oneshot reads it and builds htpasswd, but the plaintext file remains forever. **Fix:** `rm -f /etc/openclaw/desktop.env` as the final step of the cred unit (after confirming htpasswd was written).
- **m3** — `infra/cloud-init/template.yaml:39` — `openclaw doctor || true` suppresses first-boot failures. **Fix:** log to `/var/log/openclaw-doctor.log`; keep the `|| true` to avoid blocking cloud-init, but preserve signal for debugging.
- **m4** — `infra/clone.sh:148` — no duplicate hostname detection. Same output file can be rendered twice; manifest gets conflicting rows. **Fix:** fail on duplicate hostnames before rendering loop.
- **m5** — `dotfiles/bootstrap.sh:29` + `infra/cloud-init/template.yaml:15` — `AGENT_USER` is configurable in the bake but cloud-init hardcodes `/home/ubuntu` and `sudo -u ubuntu`. Either remove `AGENT_USER` configurability or thread it through cloud-init consistently.

---

## Nit

- `dotfiles/bootstrap.sh:202` + cloud-init comments say "first boot" but the oneshot unit has no stamp file — it runs on every boot and rewrites htpasswd from the lingering env file (m2 above). Either stamp it or update comments to say what it actually does.

---

## Confirmed sound (do not change)

- `clone.sh` does not echo desktop passwords or API keys to stdout/stderr ✅
- Generated cloud-init and manifest written `0600` under gitignored dir ✅
- Sudoers drop-in installed `0440` ✅
- Docker not configured for TCP exposure ✅
- Postgres not host-published ✅
- ShellCheck: 0 warnings ✅
- CodeRabbit: 0 findings ✅

---

## Fix list → loop-009-bootstrap-modularity

**Phase A — Security (do first):**
1. C1: bind nginx to `127.0.0.1:8080` + bake assertion
2. M2: validate `INSTANCE_NAME` RFC1123 in clone.sh
3. M3: validate/b64-encode API key in cloud-init write_files
4. M4: validate + quote `DESKTOP_USER`
5. M5: fail on stub key by default; require `ALLOW_STUB=1` explicitly
6. m2: delete `/etc/openclaw/desktop.env` after htpasswd written

**Phase B — Modularity (the explicit ask):**
7. M1: refactor bootstrap.sh into phase functions with `--phase` flag + stamp files
   - `phase_base` (apt, locale, sysctl)
   - `phase_toolchain` (mise, Node, OpenClaw, Claude Code, Codex CLI)
   - `phase_desktop` (Xfce, TigerVNC, websockify, nginx)
   - `phase_docker` (Docker CE, compose plugin, SonarQube stack)
   - `phase_verify` (end-to-end health checks)

**Phase C — Reliability:**
8. M6: per-host key support in clone.sh (manifest or hook pattern)
9. M7: deepen Docker idempotence guard
10. M8: SonarQube readiness poll in systemd unit
11. m3: log openclaw doctor output instead of suppressing
12. m4: dedup check in clone.sh
13. m5: resolve AGENT_USER / ubuntu inconsistency
