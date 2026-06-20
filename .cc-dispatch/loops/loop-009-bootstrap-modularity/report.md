# Loop 009 — bootstrap-modularity: Report

- **Status:** COMPLETE — all phases (A, B, C) done.
- **Repo:** `~/src/spantree/goto-2026-masterclass` · branch `main`
- **Commits:**
  - `17d86a9` fix(infra): harden bake security + reliability
  - `7fffd3c` refactor(infra): split bake into phase functions
- **Agent:** Claude Code (Opus 4.8), autonomous
- **Date:** 2026-06-20
- **Gate:** `shellcheck dotfiles/bootstrap.sh dotfiles/desktop/openclaw-desktop-cred.sh infra/clone.sh infra/services/openclaw-sonarqube-ready.sh` → **clean**. `bash -n` clean. clone.sh validation + b64 render exercised; rendered cloud-init parses as valid YAML.

## Per-item status (F1–F12)

| # | Finding | Status | Resolution |
|---|---------|--------|------------|
| F1 | C1 nginx binding | ✅ | `openclaw-desktop.nginx` now `listen 127.0.0.1:8080;` only (dropped the all-interfaces + `[::]:8080` listeners). `phase_verify` asserts via `ss -ltnH` that no non-loopback `:8080` listener exists, exits 1 with the offending line(s) if so. |
| F2 | M2 hostname injection | ✅ | `clone.sh` validates every hostname against `^[a-z][a-z0-9-]{1,62}$` before the render loop; `template.yaml` runcmd now `hostnamectl set-hostname "{{HOSTNAME}}"` (quoted). |
| F3 | M3 API key injection | ✅ | Upgraded to the stronger option: key is base64-encoded into `write_files` (`encoding: b64`, `content: "{{OPENCLAW_API_KEY_B64}}"`), so no byte can corrupt the YAML. Also kept a CR/LF guard in `clone.sh` as defense in depth. (Target goal criterion 3 asked for b64 specifically.) |
| F4 | M4 DESKTOP_USER injection | ✅ | `clone.sh` validates `DESKTOP_USER` against `^[a-z_][a-z0-9_-]{0,31}$`; `desktop.env` values written quoted (`DESKTOP_USER="…"`, `DESKTOP_PASS="…"`). |
| F5 | M5 stub key default | ✅ | `clone.sh` refuses `OPENCLAW_API_KEY_SOURCE=stub` unless `ALLOW_STUB=1`; clear error otherwise. Documented `ALLOW_STUB` in the usage header. |
| F6 | m2 delete plaintext cred | ✅ | `openclaw-desktop-cred.sh` `rm -f`s `/etc/openclaw/desktop.env` after the bcrypt htpasswd is written. Added an "already provisioned" early-exit branch so later boots (env gone, htpasswd present) are a no-op instead of warning. |
| F7 | M1 phase functions | ✅ | `bootstrap.sh` refactored into `phase_base` / `phase_toolchain` / `phase_desktop` / `phase_docker` / `phase_verify` + `ALL_PHASES`. `--phase <name>` runs one phase (force); `--force` re-runs all. Stamp files at `/var/lib/bake/<phase>.done` skip completed phases on a full re-run. All original comments + log messages preserved verbatim. |
| F8 | M7 Docker idempotence | ✅ | `phase_docker` guard now requires both `docker version` and `docker compose version` to succeed; logs which check failed and (re)installs Docker CE if either does. |
| F9 | M8 SonarQube readiness | ✅ | New `infra/services/openclaw-sonarqube-ready.sh` polls `/api/system/status` for `"status":"UP"` (30 × 5s default, env-overridable). Wired as `ExecStartPost` on `openclaw-services.service`; `TimeoutStartSec=600` so first-boot image pulls + the poll don't trip the default 90s start timeout. Installed by `phase_docker`. |
| F10 | m3 doctor logging | ✅ | `template.yaml` runcmd now `openclaw doctor > /var/log/openclaw-doctor.log 2>&1 || true` (keeps `|| true`, preserves the signal). |
| F11 | m4 dedup hostname | ✅ | `clone.sh` rejects duplicate hostnames (assoc-array check) before rendering, naming the duplicate. |
| F12 | m5 AGENT_USER consistency | ✅ | Chose **Ubuntu-only**: `bootstrap.sh` pins `AGENT_USER="ubuntu"` (no longer env-overridable) and documents why; `template.yaml` header documents the deliberate `ubuntu` hardcoding so the two layers can't desync. |

## Notes / decisions

- **Two-commit split** per the target repo's `goal.md` criterion 10: all security
  + reliability fixes in `fix(infra)`, the modularity refactor in `refactor(infra)`.
  Two in-`bootstrap.sh` fixes (F1 assertion, F8 guard) necessarily ride in the
  refactor commit because they live inside the refactored functions; the refactor
  commit body calls this out.
- **F3 went with b64** (not just the CR/LF guard) to satisfy the target repo's
  goal criterion, which differs from the workspace copy that allowed either.
- **`--force` flag added** (target criterion 9) on top of the workspace spec's
  `--phase`-forces-one-phase behavior.
- **Steps 6–7** (shim wiring, shell config) live in `phase_toolchain` alongside
  steps 3–5 — they are toolchain setup and have no other phase to belong to.
- **Guardrails honored:** `skills/` untouched (loop-008 scope; my two commits
  contain only `dotfiles/` + `infra/` files). No new apt packages. Bake stays
  idempotent. Could not run the full bake here (needs root on Ubuntu/Hetzner) —
  verification was shellcheck + `bash -n` + off-box exercise of clone.sh's
  validation/render and YAML validity.

## Follow-ups (out of scope for this loop)

- **M6 (per-host API keys):** not in this loop's F-list (workspace goal.md F1–F12
  nor the target goal.md success criteria). `clone.sh` still issues the same key
  to every host in `env`/`op` modes. Worth a future loop.
- **m1 (htpasswd bcrypt cost):** `htpasswd -bBc` still uses the default cost;
  not in scope here. Consider `-C 12`.
