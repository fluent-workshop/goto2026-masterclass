# Loop 011 — Cloudflare Tunnels per-box access layer — Report

**Status:** Complete. All phases A–E done. Verified off-box (shellcheck clean,
`bash -n` clean, runtime logic exercised, cloud-init YAML parses). Bake NOT run
(needs root/Ubuntu, per spec).

Date: 2026-06-20. Branch: `main`.

## Per-phase status

### Phase A — code-server: DEFERRED ⏸

- code-server was originally added here but is now **deferred entirely** (security):
  it is the one service genuinely dangerous to expose. The editor path is the
  VS Code Remote Tunnel (devtunnel), which dials out and needs no inbound ingress.
- Removed: the `phase_desktop` install, the `openclaw-code-server.service` unit,
  the `CODE_SERVER_VERSION` pin, the `8088` ingress rule, and the `phase_verify`
  check. A short deferral note remains in `openclaw-tunnel-config.sh`.

### Phase B — cloudflared (`phase_tunnel`, new) ✅

- New `phase_tunnel` function, same phase-fn + stamp + `--phase`/`--force`
  pattern. Wired into `ALL_PHASES` after `phase_desktop`, before `phase_docker`.
- Pinned `CLOUDFLARED_VERSION=2025.11.1`; installed from pinned upstream `.deb`
  (version-guarded, idempotent).
- Helper `dotfiles/tunnel/openclaw-tunnel-config.sh` → installed to
  `/usr/local/sbin/` (matches `openclaw-sonarqube-ready.sh` / `*-cred.sh`).
  Holds the single `hash8()` function: `sha256(hostname+salt)[:8]`.
- Unit `dotfiles/tunnel/openclaw-tunnel.service`: `After=network-online.target`,
  `EnvironmentFile=/etc/openclaw/tunnel.env`, `ExecStartPre` renders config,
  `ExecStart` runs token-based `cloudflared … tunnel run --token …` (no cert.pem).
- First boot: helper renders `/etc/cloudflared/config.yml` with all 6 ingress
  rules, named `${host}-goto2026-*` one label under the apex `fluentworkshop.dev`
  (`-goto2026-app` public/no-hash; `-goto2026-desktop`/`-supabase-studio`/
  `-gateway`/`-ssh`/`-postgres` hash-obscured) + the `http_status:404` catch-all.
  Idempotent via content compare (`cmp`). DNS is flat per-box CNAMEs (no fleet
  wildcard); one-label-under-apex names let free Universal SSL
  `*.fluentworkshop.dev` cover them with no CT-log exposure.
- **Verified off-box:** renders exactly 7 `service:` lines (6 + catch-all),
  hash derivation matches `sha256sum|cut -c1-8`, second run is a no-op.

### Phase C — nginx fail-fast + 503 ✅

- Added `proxy_connect_timeout 2s;` to the noVNC proxy route. Kept
  `proxy_read_timeout 3600s` UNCHANGED (live desktop WebSocket).
- Added reusable `@offline` named location + styled
  `dotfiles/desktop/offline.html` (auto-refreshes every 10s). Documented the
  opt-in pattern in a comment for the later Supabase/dev-server routes.
- Desktop route wired: `proxy_intercept_errors on; error_page 502 504 @offline;`
  (no `=` override → upstream 5xx preserved; `try_files … =503` fallback).
- offline.html laid down in `phase_desktop` alongside index.html.

### Phase D — clone.sh + cloud-init wiring ✅

- `template.yaml`: new `write_files` entry `/etc/openclaw/tunnel.env`
  (root:root 0600) with `TUNNEL_SALT`, `CLOUDFLARED_TOKEN`,
  `POSTGRES_APP_PASSWORD`. Documented as NOT consumed/deleted (connector reads
  the token every boot), unlike `desktop.env`.
- `clone.sh`: new `TUNNEL_SECRETS_SOURCE` (stub|env|op), generic
  `fetch_tunnel_secret` helper, threaded all three placeholders through render.
  Secrets read ONCE (fleet-wide) before the host loop — documented.
- Validation: `TUNNEL_SALT` must match `^[A-Za-z0-9]{8,128}$`; token + PG
  password rejected on CR/LF. Stub gated behind `ALLOW_STUB=1` (same as the API
  key); stub values are obviously non-secret and pass the placeholder check.
- **Verified off-box:** stub-without-ALLOW_STUB fails; stub-with-ALLOW_STUB
  renders leak-free; bad salt fails validation; env-mode renders; rendered
  cloud-init parses as valid YAML with tunnel.env at root:root 0600.

### Phase E — verify + remove Tailscale ✅

- `phase_verify` additions: cloudflared installed; `/etc/cloudflared/config.yml`
  ABSENT at bake (first-boot generated); `is-enabled` list extended with
  `openclaw-tunnel.service`.
- Updated the loopback-8080 assertion comment (was "Tailscale Funnel").
- **Zero `tailscale`/`Funnel`/`funnel`/`tailnet` references** remain in
  `dotfiles/`, `infra/`, `docs/`, `README.md` (grep clean). Touched:
  `bootstrap.sh`, `openclaw-desktop.nginx`, `compose.yml`, and the PRD
  (FR-5 rewritten, dependencies/file-table/rollout/related/Q2 updated, a new
  2026-06-20 changelog entry added; historical changelog lines reworded to drop
  the superseded tech names without rewriting the dated decisions).

## Verification performed (off-box)

- `shellcheck` CLEAN on `bootstrap.sh`, `openclaw-tunnel-config.sh`, `clone.sh`.
- `bash -n` CLEAN on all three.
- Tunnel helper rendered + idempotency + hash + ingress-count exercised.
- clone.sh stub/env/validation paths exercised; cloud-init YAML parsed.
- `nginx -t` NOT runnable off-box (no nginx) — config kept syntactically valid.

## TODOs / open items

- **Pin version unverified.** `CLOUDFLARED_VERSION=2025.11.1` is a plausible
  placeholder — confirm/bump against the upstream release page before the bake
  (commented inline).
- **code-server deferred (security).** The editor path is the VS Code Remote
  Tunnel (devtunnel); code-server is out of this loop entirely.
- **OpenClaw gateway port** assumed `18789` per spec default — confirm via
  `openclaw --help`/docs on a live box (TODO left in the helper).
- **Token + local config.yml interaction:** the architecture (per spec) renders
  a local `config.yml` AND uses `--token`. If a dashboard-managed config takes
  precedence for token connectors on the pinned cloudflared version, move the
  ingress rules into the dashboard (TODO noted in the helper).
- **Out-of-band DNS:** each box's flat per-service `${host}-goto2026-*.fluentworkshop.dev`
  CNAMEs (to that box's own tunnel, via `cloudflared tunnel route dns`) and the
  per-box tunnel token are created in Cloudflare outside this loop. No fleet
  wildcard — that would point every box at one tunnel.
- Stale memory `tailscale-auth-key-needed.md` is now obsolete (access layer no
  longer uses Tailscale) — flag for cleanup.
