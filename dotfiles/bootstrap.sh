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
OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.6.5}"    # pinned to Cedric's known-good build; bump deliberately
NODE_VERSION="${NODE_VERSION:-22}"                   # LTS major; mise resolves the latest 22.x
AGENT_USER="${AGENT_USER:-ubuntu}"  # use the stock cloud-image user (passwordless sudo + injected SSH key already present)

AGENT_HOME="/home/$AGENT_USER"
MISE_BIN="$AGENT_HOME/.local/bin/mise"
SHIMS_DIR="$AGENT_HOME/.local/share/mise/shims"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

# Run a command AS the agent user with the mise toolchain on PATH. HOME is set
# explicitly so build steps land in the agent user's tree (not root's).
as_agent() {
  sudo -u "$AGENT_USER" env \
    HOME="$AGENT_HOME" \
    PATH="$SHIMS_DIR:$AGENT_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" \
    "$@"
}

# ---- 1. Base OS packages --------------------------------------------------
# Small classroom subset: shell, VCS, multiplexer, and the search/unpack tools
# the exercises lean on. Language toolchains come from mise, NOT apt — so no
# gnupg/NodeSource apt-key dance is needed here.
log "Updating apt and installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl git build-essential ca-certificates \
  zsh tmux jq ripgrep unzip

# ---- 2. Agent user --------------------------------------------------------
# On Ubuntu cloud images the `ubuntu` user already exists with passwordless
# sudo (via /etc/sudoers.d/90-cloud-init-users) and the injected SSH key.
# We only create/repair it if something is off (e.g. running on a non-cloud
# base), then switch its shell to zsh for the classroom experience.
if ! id "$AGENT_USER" &>/dev/null; then
  log "Creating agent user: $AGENT_USER"
  useradd -m -s /usr/bin/zsh "$AGENT_USER"
  usermod -aG sudo "$AGENT_USER"
  echo "$AGENT_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$AGENT_USER"
else
  log "Using existing user: $AGENT_USER (setting login shell to zsh)"
  chsh -s /usr/bin/zsh "$AGENT_USER" 2>/dev/null || usermod -s /usr/bin/zsh "$AGENT_USER"
fi

# ---- 3. Node via mise (per-user) ------------------------------------------
# mise is installed for the AGENT USER (it is a per-user tool manager), so it
# lands in $AGENT_HOME/.local — never root's tree. Node is pinned to the major
# in $NODE_VERSION. See section 5 for how the toolchain is made resolvable to
# non-interactive / non-login launchers via /usr/local/bin shims.
if [[ ! -x "$MISE_BIN" ]]; then
  log "Installing mise for $AGENT_USER"
  sudo -u "$AGENT_USER" env HOME="$AGENT_HOME" sh -c 'curl -fsSL https://mise.run | sh'
fi

log "Pinning node@${NODE_VERSION} via mise (global)"
as_agent "$MISE_BIN" use -g "node@${NODE_VERSION}"
as_agent "$MISE_BIN" reshim   # ensure node/npm/npx shims exist before we use npm

# ---- 4. OpenClaw (pinned, via the mise-managed Node) ----------------------
# Installed with the mise npm, so it lands in mise's node prefix; `mise reshim`
# then generates an `openclaw` shim alongside node/npm. Guarded on the pinned
# version so re-runs are a no-op.
current_oc="$(as_agent openclaw --version 2>/dev/null || true)"
if [[ "$current_oc" != *"$OPENCLAW_VERSION"* ]]; then
  log "Installing openclaw@${OPENCLAW_VERSION}"
  as_agent npm install -g "openclaw@${OPENCLAW_VERSION}"
  as_agent "$MISE_BIN" reshim
else
  log "openclaw@${OPENCLAW_VERSION} already present — skipping"
fi

# ---- 5. Wire the toolchain into /usr/local/bin (non-login resolution) ------
# A non-login, non-interactive launcher (systemd unit, `ssh host openclaw ...`
# with no TTY, or `env -i sh -c 'openclaw --version'`) never sources zshrc, so
# it never runs `mise activate`. To make `node`/`npm`/`npx`/`openclaw` resolve
# anyway, we symlink the per-user mise *shims* into /usr/local/bin — the first
# local dir on dash's default PATH, so even a stripped `env -i /bin/sh` finds
# them. The shims are themselves the mise binary; invoked by basename they
# re-exec the right tool. mise locates the agent user's install tree from the
# uid's passwd entry, so resolution works even when $HOME is unset.
log "Symlinking mise shims into /usr/local/bin"
ln -sf "$MISE_BIN" /usr/local/bin/mise
for shim in node npm npx openclaw; do
  ln -sf "$SHIMS_DIR/$shim" "/usr/local/bin/$shim"
done

# ---- 6. Shell environment (the "dotfiles" layer) -------------------------
log "Linking shell config for $AGENT_USER"
install -d -o "$AGENT_USER" -g "$AGENT_USER" "$AGENT_HOME/.config"
# shell/ files are baked alongside this script; copy if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "$SCRIPT_DIR/shell" ]]; then
  for rc in zshrc zshenv; do
    if [[ -f "$SCRIPT_DIR/shell/$rc" ]]; then
      install -m 0644 -o "$AGENT_USER" -g "$AGENT_USER" \
        "$SCRIPT_DIR/shell/$rc" "$AGENT_HOME/.$rc"
    fi
  done
fi

# ---- 7. Verify the bake ---------------------------------------------------
# Verify AS the agent user — the symlinks resolve to that user's mise tree.
log "Verifying install (as $AGENT_USER)"
as_agent node -v
as_agent npm -v
# Canonical non-login resolution gate: a stripped environment (no PATH, no
# HOME) must still resolve openclaw via the /usr/local/bin shims. This is the
# exact acceptance test from the loop spec; if shim wiring is wrong it fails
# the bake loudly here rather than silently in class.
log "Verifying non-login resolution (stripped env)"
sudo -u "$AGENT_USER" env -i /bin/sh -c 'openclaw --version'

log "Bake complete. Snapshot this server now."
log "  hcloud server create-image <name> --type snapshot --description goto2026-golden"
