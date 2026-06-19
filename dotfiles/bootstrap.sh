#!/usr/bin/env bash
# bootstrap.sh — Bake the golden OpenClaw image for the GOTO 2026 masterclass.
#
# Run ONCE on a fresh Hetzner VPS (Ubuntu 24.04, 4GB+ RAM), then snapshot it.
# Idempotent: safe to re-run while iterating on the recipe.
#
#   ssh root@<fresh-vps>
#   curl -fsSL https://raw.githubusercontent.com/spantree/goto-2026-masterclass/main/dotfiles/bootstrap.sh | bash
#   # then: hcloud server create-image <server> --type snapshot --description "goto2026-golden"
#
# Per-instance differences (hostname, API keys) are NOT set here — cloud-init
# handles those at clone time so the snapshot stays generic.

set -euo pipefail

# ---- Pin everything. A masterclass image must be reproducible. -------------
OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.6.18}"   # pinned; bump deliberately
NODE_VERSION="${NODE_VERSION:-22}"                   # LTS
AGENT_USER="${AGENT_USER:-student}"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

# ---- 1. Base OS packages --------------------------------------------------
log "Updating apt and installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl git build-essential ca-certificates gnupg \
  zsh tmux jq ripgrep unzip

# ---- 2. Non-root agent user ----------------------------------------------
if ! id "$AGENT_USER" &>/dev/null; then
  log "Creating agent user: $AGENT_USER"
  useradd -m -s /usr/bin/zsh "$AGENT_USER"
  usermod -aG sudo "$AGENT_USER"
  echo "$AGENT_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-$AGENT_USER
fi

# ---- 3. Node via NodeSource (pinned major) -------------------------------
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  log "Installing Node.js ${NODE_VERSION}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y -qq nodejs
fi

# ---- 4. OpenClaw (pinned) -------------------------------------------------
log "Installing openclaw@${OPENCLAW_VERSION}"
npm install -g "openclaw@${OPENCLAW_VERSION}"

# ---- 5. Shell environment (the "dotfiles" layer) -------------------------
log "Linking shell config for $AGENT_USER"
install -d -o "$AGENT_USER" -g "$AGENT_USER" "/home/$AGENT_USER/.config"
# shell/ files are baked alongside this script; copy if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "$SCRIPT_DIR/shell" ]]; then
  cp "$SCRIPT_DIR/shell/zshrc"  "/home/$AGENT_USER/.zshrc"  2>/dev/null || true
  cp "$SCRIPT_DIR/shell/zshenv" "/home/$AGENT_USER/.zshenv" 2>/dev/null || true
  chown "$AGENT_USER:$AGENT_USER" "/home/$AGENT_USER/.zshrc" "/home/$AGENT_USER/.zshenv" 2>/dev/null || true
fi

# ---- 6. Verify the bake ---------------------------------------------------
log "Verifying install"
node -v
npm -v
sudo -u "$AGENT_USER" openclaw --version || { echo "openclaw not on PATH for $AGENT_USER"; exit 1; }

log "Bake complete. Snapshot this server now."
log "  hcloud server create-image <name> --type snapshot --description goto2026-golden"
