# Loop 011 — Cloudflare Tunnels per-box access layer

**Objective:** Replace the Tailscale-fronted access model with Cloudflare Tunnels (`cloudflared`). Each box runs one `cloudflared` daemon with multiple ingress rules routing hash-obscured subdomains under `goto26.fluentworkshop.dev` to local services. Add code-server. Extend nginx with friendly fail-fast 503s. All work is shell + systemd + nginx + cloud-init; commit to `main` of `~/src/spantree/goto-2026-masterclass`.

## Ground truth (read first)

- `references/CURRENT-bootstrap.sh` — the live bake script. Phase functions: `phase_base`, `phase_toolchain`, `phase_desktop`, `phase_docker`, `phase_verify`. Stamp/`--phase`/`--force` dispatch at bottom. **Preserve this structure.**
- `references/CURRENT-nginx.conf` — live nginx (`dotfiles/desktop/openclaw-desktop.nginx`). noVNC reverse proxy, loopback:8080, basic auth, WebSocket map.
- `references/CURRENT-clone.sh` — live `infra/clone.sh`. Validates HOSTNAME (RFC 1123), b64-encodes the API key, idempotent per-host manifest, stub/env/op key sources.
- `references/CURRENT-cloud-init.yaml` — live `infra/cloud-init/template.yaml`. `{{HOSTNAME}}`, `{{OPENCLAW_API_KEY_B64}}`, `{{DESKTOP_USER}}`, `{{DESKTOP_PASS}}` placeholders.

## Architecture (decided — do not redesign)

**Domain:** `fluentworkshop.dev` (Cloudflare zone). Workshop scope: `goto26.fluentworkshop.dev`.
**DNS:** single wildcard `*.goto26.fluentworkshop.dev CNAME <tunnel-uuid>.cfargotunnel.com` (created out-of-band; NOT this loop's job).
**Hash:** `hash8 = sha256(hostname + TUNNEL_SALT)[:8]` (hex, lowercase). Public services skip the hash; protected services use it.
**Tailscale:** removed entirely from bootstrap, nginx comments, and docs.

### Per-box subdomains

Browser-accessible (Cloudflare terminates TLS, no client install):
| Subdomain | Local target |
|---|---|
| `{host}-dev` | `localhost:3000` (Vite dev server — public, no hash) |
| `{host}-desktop-{hash8}` | `localhost:8080` (nginx → noVNC) |
| `{host}-code-server-{hash8}` | `localhost:8088` (code-server) |
| `{host}-supabase-studio-{hash8}` | `localhost:54323` |
| `{host}-gateway-{hash8}` | `localhost:18789` (OpenClaw gateway; confirm port via `openclaw --help`/docs, default to 18789 and leave a TODO if unverifiable) |

Requires `cloudflared` client (admin + advanced):
| Subdomain | Local target | Protocol |
|---|---|---|
| `{host}-ssh-{hash8}` | `ssh://localhost:22` | SSH |
| `{host}-postgres-{hash8}` | `tcp://localhost:54322` | TCP (Postgres) |

## Phases

### Phase A — code-server (in `phase_desktop`)
1. Install code-server (pinned version; use the official standalone install or apt repo, pinned — match the repo's existing pinning discipline). Add the version to the pinned-versions block at the top of bootstrap.sh.
2. systemd unit `openclaw-code-server.service`: runs code-server bound to `127.0.0.1:8088`, `--auth none` (Cloudflare/hash is the gate, not code-server's own auth), `--disable-telemetry`, working dir `/home/ubuntu`. Run as `ubuntu`. Enable but expect first real start on boot.
3. Do NOT expose code-server through the existing desktop nginx server block — it gets its own cloudflared ingress straight to `localhost:8088`.

### Phase B — cloudflared (new `phase_tunnel`, runs after `phase_desktop`)
1. Add `phase_tunnel` as a new phase function. Insert into `ALL_PHASES` in the right order (after `phase_desktop`, before `phase_docker` is fine). Give it its own stamp, matching the existing stamp/`--phase`/`--force` pattern exactly.
2. Install `cloudflared` (official apt repo or pinned .deb; pin the version, add to the pinned block).
3. Create a templated systemd unit + a first-boot config-generation script:
   - **Bake time:** install `cloudflared`, drop a `openclaw-tunnel-config.sh` helper script under `/usr/local/lib/openclaw/` (or the repo's existing helper location — check where `openclaw-sonarqube-ready.sh` lives and match it) and an `openclaw-tunnel.service` systemd unit (enabled, `After=network-online.target`).
   - **First boot:** the helper reads `TUNNEL_SALT` and `CLOUDFLARED_TOKEN` from a root-only env file injected via cloud-init (`/etc/openclaw/tunnel.env`), computes `hash8` from the hostname, renders `/etc/cloudflared/config.yml` with all seven ingress rules + the catch-all `- service: http_status:404`, then runs `cloudflared service install` (token-based) OR `cloudflared tunnel run` against the named tunnel. Use the **token-based** connector model (`cloudflared tunnel run --token $CLOUDFLARED_TOKEN`) so no cert.pem is needed on the box.
   - Idempotent: if `/etc/cloudflared/config.yml` already exists and matches, skip regeneration (stamp or content check).
4. The hash derivation must be a single well-tested shell function: `printf '%s%s' "$hostname" "$salt" | sha256sum | cut -c1-8`. Put it in the helper script, not inline in three places.

### Phase C — nginx fail-fast + 503 pages
1. In `references/CURRENT-nginx.conf`'s served config, add to the noVNC proxy route: `proxy_connect_timeout 2s;` and keep the long `proxy_read_timeout` for the live WebSocket (don't shorten the desktop read timeout — that one needs 3600s; the 2s connect timeout is what makes a dead backend fail fast).
2. This loop does NOT add the Supabase/dev-server nginx routes (those live in the companion app + a later loop). But DO add a reusable `@offline` named-location pattern + a styled `/usr/share/openclaw-desktop/offline.html` so the later loop can wire services to it. Document the pattern in a comment.

### Phase D — clone.sh + cloud-init wiring
1. `infra/cloud-init/template.yaml`: add a `write_files` entry for `/etc/openclaw/tunnel.env` (root:root 0600) containing `TUNNEL_SALT="{{TUNNEL_SALT}}"` and `CLOUDFLARED_TOKEN="{{CLOUDFLARED_TOKEN}}"`. Also add `POSTGRES_APP_PASSWORD="{{POSTGRES_APP_PASSWORD}}"` for later use.
2. `infra/clone.sh`: thread the three new placeholders through the render. `TUNNEL_SALT`, `CLOUDFLARED_TOKEN`, `POSTGRES_APP_PASSWORD` come from env or 1Password (`op` source), same pattern as `OPENCLAW_API_KEY`. For `stub` mode, render documented placeholders that pass the unsubstituted-placeholder check but are obviously non-secret (and gated behind `ALLOW_STUB=1` like the existing key). Validate `TUNNEL_SALT` is hex/alphanumeric and `CLOUDFLARED_TOKEN` has no CR/LF before substitution.
3. Keep the existing idempotent per-host manifest behavior — salt/token are fleet-wide (same salt for all boxes; the hostname is what varies the hash), so they can be read once, not per-host-generated. Document this.

### Phase E — verify + remove Tailscale
1. `phase_verify`: add a check that `cloudflared` is installed and the unit is enabled. Add a check that `/etc/cloudflared/config.yml` is absent at bake (it's first-boot-generated) — i.e., the bake should NOT have rendered it. Add a check that code-server is listening on `127.0.0.1:8088` after its unit starts (or just that the unit is enabled, if the bake doesn't start it).
2. Remove/replace all Tailscale references in `dotfiles/`, `infra/`, and any `.md` in the repo root or `docs/` that mention Tailscale Funnel as the access path. Replace with the cloudflared model. Grep for `tailscale`, `Funnel`, `funnel` and fix each.

## Guardrails

- **Do not** touch `skills/`, the companion app, or anything outside `dotfiles/`, `infra/`, `docs/`.
- **Preserve** the phase-function + stamp + `--phase`/`--force` architecture exactly. New phase = same pattern.
- **Pin every version** you install (cloudflared, code-server). Add to the pinned block at the top of bootstrap.sh.
- **No secrets in the repo or snapshot.** Salt/token/password are cloud-init only. Stub mode renders non-secret placeholders gated by `ALLOW_STUB=1`.
- **Token-based cloudflared** (no cert.pem). `cloudflared tunnel run --token`.
- Keep the bake idempotent and offline-safe (no network image pulls during bake beyond package installs).
- ShellCheck must pass on every modified `.sh`. `bash -n` clean. `nginx -t` is not runnable off-box — just keep syntax valid.

## Done when

- `phase_tunnel` exists, wired into `ALL_PHASES` + dispatch, with its own stamp.
- code-server installed + `openclaw-code-server.service` present (bound 127.0.0.1:8088, auth none).
- cloudflared installed; first-boot helper renders `/etc/cloudflared/config.yml` with all 7 ingress rules + catch-all; token-based `cloudflared tunnel run`.
- Single hash function; salt+token from `/etc/openclaw/tunnel.env`.
- nginx: 2s connect timeout on the proxy route + reusable `@offline` + `offline.html`.
- clone.sh + cloud-init thread `TUNNEL_SALT`, `CLOUDFLARED_TOKEN`, `POSTGRES_APP_PASSWORD` (stub-safe, validated).
- Zero `tailscale`/`Funnel` references remain (grep clean).
- ShellCheck + `bash -n` clean on all modified shell.
- `report.md` written with per-phase status + any TODOs (e.g. unverified gateway port).

## Stop condition

Write `report.md` and go idle after all phases complete OR after 45 turns. Do not start another loop. Do not run the bake (needs root/Ubuntu) — verify via shellcheck + syntax + off-box logic exercise.
