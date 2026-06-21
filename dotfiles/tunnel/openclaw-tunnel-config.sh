#!/usr/bin/env bash
# Render /etc/cloudflared/config.yml for this box's Cloudflare Tunnel ingress.
#
# Runs at FIRST BOOT (openclaw-tunnel.service ExecStartPre), NOT during the bake
# — the golden snapshot must carry no host-specific config and no secret. The
# salt comes from /etc/openclaw/tunnel.env, which cloud-init drops per instance;
# until that file exists this exits non-zero and the connector unit stays down.
#
# Access model: each service gets a hostname ONE level under the apex
# fluentworkshop.dev, with a `-goto2026-` infix. There is NO fleet-wide wildcard
# CNAME — a wildcard would point every box at one tunnel, which is wrong for
# per-box tunnels. Instead each box gets explicit FLAT per-service CNAMEs to ITS
# OWN tunnel, created at clone time with `cloudflared tunnel route dns <tunnel>
# <hostname>`. PUBLIC services use a bare `-app` name; every PROTECTED service is
# obscured by an 8-hex hash derived from the hostname + a fleet-wide salt. The
# "not enumerable" property comes from (a) DNS zones can't be listed/AXFR'd and
# (b) the hash8 on protected services — NOT from a wildcard. Cloudflare terminates
# TLS at its edge; cloudflared dials the loopback targets below.
#
# TLS: every hostname is exactly one label under the apex, so the free Universal
# SSL cert (`*.fluentworkshop.dev`) covers them all — individual hostnames never
# hit Certificate Transparency logs (no per-host cert is ever issued).
#
# Token-based connector: the unit runs `cloudflared tunnel run --token …`, so the
# token (not a cert.pem) supplies the tunnel credentials; this file supplies the
# ingress rules. (If a dashboard-managed config ever takes precedence over a local
# config.yml for token connectors, move these rules into the dashboard — TODO.)

set -euo pipefail

ENV_FILE="/etc/openclaw/tunnel.env"
CONFIG_DIR="/etc/cloudflared"
CONFIG="$CONFIG_DIR/config.yml"
DOMAIN_BASE="fluentworkshop.dev"

# Single source of truth for the hash. hash8 = sha256(hostname + salt)[:8], hex,
# lowercase. Used for every protected subdomain so the derivation never drifts.
hash8() {
  printf '%s%s' "$1" "$2" | sha256sum | cut -c1-8
}

if [[ ! -r "$ENV_FILE" ]]; then
  echo "openclaw-tunnel-config: $ENV_FILE absent — cannot render config; connector stays down." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null  # runtime file written by cloud-init, not at lint time
. "$ENV_FILE"
set +a

if [[ -z "${TUNNEL_SALT:-}" ]]; then
  echo "openclaw-tunnel-config: TUNNEL_SALT missing in $ENV_FILE." >&2
  exit 1
fi

# Short hostname is what varies the hash across the fleet (the salt is shared).
host="$(hostname -s)"
h="$(hash8 "$host" "$TUNNEL_SALT")"

mkdir -p "$CONFIG_DIR"

# Render to a temp file first so an interrupted write never leaves a half-config,
# and so we can skip the write (idempotent) when nothing changed.
tmp="$(mktemp "${TMPDIR:-/tmp}/cloudflared-config.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

{
  echo "# Managed by openclaw-tunnel-config.sh — DO NOT EDIT (regenerated each boot)."
  echo "# host=${host} domain=${DOMAIN_BASE}"
  echo "# Token-based connector: credentials come from CLOUDFLARED_TOKEN, not a cert."
  echo "no-autoupdate: true"
  echo "ingress:"
  # --- Public (no hash): the Vite dev server students share live. ----------
  echo "  - hostname: ${host}-goto2026-app.${DOMAIN_BASE}"
  echo "    service: http://localhost:3000"
  # --- Protected (hash-obscured) browser services. -------------------------
  echo "  - hostname: ${host}-goto2026-desktop-${h}.${DOMAIN_BASE}"
  echo "    service: http://localhost:8080"
  # NOTE: code-server (browser VS Code, would be localhost:8088) is DEFERRED — it
  # is the one service genuinely dangerous to expose, so the editor path is the
  # VS Code Remote Tunnel (devtunnel) instead, which needs no inbound ingress.
  echo "  - hostname: ${host}-goto2026-supabase-studio-${h}.${DOMAIN_BASE}"
  echo "    service: http://localhost:54323"
  # OpenClaw gateway port: default 18789; confirm via `openclaw --help`/docs.
  # TODO(loop-011): verify the gateway listen port on a live box.
  echo "  - hostname: ${host}-goto2026-gateway-${h}.${DOMAIN_BASE}"
  echo "    service: http://localhost:18789"
  # --- Protected non-HTTP services (require the cloudflared client). -------
  echo "  - hostname: ${host}-goto2026-ssh-${h}.${DOMAIN_BASE}"
  echo "    service: ssh://localhost:22"
  echo "  - hostname: ${host}-goto2026-postgres-${h}.${DOMAIN_BASE}"
  echo "    service: tcp://localhost:54322"
  # --- Mandatory catch-all: anything unmatched gets a 404, never a default. -
  echo "  - service: http_status:404"
} > "$tmp"

# Idempotent: only replace config.yml when the rendered content actually changed,
# so a reboot doesn't churn the file (or trigger needless connector reloads).
if [[ -f "$CONFIG" ]] && cmp -s "$tmp" "$CONFIG"; then
  echo "openclaw-tunnel-config: $CONFIG already current (host=${host}) — no change."
  exit 0
fi

install -m 0644 "$tmp" "$CONFIG"
echo "openclaw-tunnel-config: wrote $CONFIG for host '${host}' (6 ingress rules + catch-all)."
