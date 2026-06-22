#!/usr/bin/env bash
# openclaw-init.sh — Per-box OpenClaw first-boot configuration.
#
# Runs once at first boot (openclaw-init.service, After=cloud-final.target) so
# cloud-init has already dropped /etc/openclaw/oc-bootstrap.json with the per-box
# credentials. Idempotent: safe to re-run (config patch is a merge, gateway
# install is a no-op if already installed).
#
# Does NOT run at bake time — the golden snapshot carries no secrets.

set -euo pipefail

AGENT_USER="ubuntu"
AGENT_HOME="/home/$AGENT_USER"
BOOTSTRAP_JSON="/etc/openclaw/oc-bootstrap.json"
LOG="/var/log/openclaw-init.log"

log() { echo "[openclaw-init] $*" | tee -a "$LOG"; }

log "Starting OpenClaw first-boot init"

if [[ ! -f "$BOOTSTRAP_JSON" ]]; then
  log "ERROR: $BOOTSTRAP_JSON absent — cannot configure OpenClaw." >&2
  exit 1
fi

# ---- 1. Enable user lingering so systemd --user units survive without a login
log "Enabling systemd linger for $AGENT_USER"
loginctl enable-linger "$AGENT_USER"
# Give lingering session a moment to start
sleep 2

# ---- 2. Install the gateway service (idempotent)
log "Installing OpenClaw gateway service"
sudo -u "$AGENT_USER" env HOME="$AGENT_HOME" XDG_RUNTIME_DIR="/run/user/$(id -u $AGENT_USER)" \
  openclaw gateway install >> "$LOG" 2>&1 || true

# ---- 3. Install the Discord plugin
log "Installing @openclaw/discord plugin"
sudo -u "$AGENT_USER" env HOME="$AGENT_HOME" \
  openclaw plugins install @openclaw/discord >> "$LOG" 2>&1 || true

# ---- 4. Patch OpenClaw config from the bootstrap JSON
log "Patching OpenClaw config from $BOOTSTRAP_JSON"
sudo -u "$AGENT_USER" env HOME="$AGENT_HOME" \
  openclaw config patch --file "$BOOTSTRAP_JSON" >> "$LOG" 2>&1

# ---- 5. Start (or restart) the gateway
log "Starting OpenClaw gateway"
sudo -u "$AGENT_USER" env HOME="$AGENT_HOME" XDG_RUNTIME_DIR="/run/user/$(id -u $AGENT_USER)" \
  openclaw gateway restart >> "$LOG" 2>&1 || \
sudo -u "$AGENT_USER" env HOME="$AGENT_HOME" XDG_RUNTIME_DIR="/run/user/$(id -u $AGENT_USER)" \
  openclaw gateway start >> "$LOG" 2>&1 || true

log "OpenClaw first-boot init complete."
