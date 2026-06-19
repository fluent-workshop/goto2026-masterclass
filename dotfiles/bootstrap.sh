#!/usr/bin/env bash
# bootstrap.sh — Bake the golden OpenClaw image for the GOTO 2026 masterclass.
#
# Run ONCE on a fresh Hetzner VPS (Ubuntu 24.04, 4GB+ RAM), then snapshot it.
# Idempotent: safe to re-run while iterating on the recipe.
#
# Run from a CHECKOUT of the repo (NOT piped over curl|bash — the shell/
# profiles must be present on disk; see the preflight guard below):
#
#   ssh root@<fresh-vps>
#   git clone https://github.com/spantree/goto-2026-masterclass.git
#   cd goto-2026-masterclass
#   bash dotfiles/bootstrap.sh
#   # then: hcloud server create-image <server> --type snapshot --description "goto2026-golden"
#
# Per-instance differences (hostname, API keys) are NOT set here — cloud-init
# handles those at clone time so the snapshot stays generic.

set -euo pipefail

# ---- Pin everything. A masterclass image must be reproducible. -------------
OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.6.5}"     # pinned to Cedric's known-good build; bump deliberately
NODE_VERSION="${NODE_VERSION:-22.23.0}"              # exact LTS ("Jod") patch; bump deliberately
MISE_VERSION="${MISE_VERSION:-v2026.6.11}"           # exact mise release tag (git tag form, leading v)
# SHA256 of the linux-x64 mise binary for $MISE_VERSION, from the release's
# SHASUMS256.txt. MUST be updated together with MISE_VERSION — a mismatch
# fails the bake loudly rather than installing an unverified binary.
MISE_SHA256="${MISE_SHA256:-4c1036af15efea3a4d83f13481132ec7d7dda15e7ec5869dd70a64072bf1a6c9}"
AGENT_USER="${AGENT_USER:-ubuntu}"  # use the stock cloud-image user (passwordless sudo + injected SSH key already present)

AGENT_HOME="/home/$AGENT_USER"
MISE_BIN="$AGENT_HOME/.local/bin/mise"
SHIMS_DIR="$AGENT_HOME/.local/share/mise/shims"

# Plain output when stdout is not a TTY (bake logs are usually captured), so we
# don't litter raw ANSI escapes into a log file.
log() {
  if [[ -t 1 ]]; then printf '\033[1;36m==>\033[0m %s\n' "$*"; else printf '==> %s\n' "$*"; fi
}

# Run a command AS the agent user with the mise toolchain on PATH. HOME is set
# explicitly so build steps land in the agent user's tree (not root's).
as_agent() {
  sudo -u "$AGENT_USER" env \
    HOME="$AGENT_HOME" \
    PATH="$SHIMS_DIR:$AGENT_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" \
    "$@"
}

# ---- 0. Preflight (fail loud, fail early) ---------------------------------
# (a) The shell/ profiles must be on disk next to this script. Piping the
#     script over curl|bash leaves ${BASH_SOURCE[0]} empty → SCRIPT_DIR becomes
#     $PWD → the profile copy is silently skipped → a profile-less box (no shims
#     on interactive PATH, no prompt, no compinit). Require a real checkout.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -d "$SCRIPT_DIR/shell" ]]; then
  echo "FATAL: '$SCRIPT_DIR/shell' not found." >&2
  echo "Run from a repo checkout (git clone … && bash dotfiles/bootstrap.sh)," >&2
  echo "NOT piped over curl|bash — the shell/ profiles must exist on disk." >&2
  exit 1
fi

# (b) Non-login resolution relies on /usr/local/bin being on dash's default
#     PATH (where we symlink the shims). It is on Ubuntu 24.04, but it's a
#     compile-time default, not POSIX-guaranteed — assert it so a re-bake on a
#     different base fails here instead of silently in class.
# shellcheck disable=SC2016  # $PATH must stay literal: it expands in the env -i subshell, not here
_default_path="$(env -i /bin/sh -c 'printf %s "$PATH"')"
if [[ ":$_default_path:" != *":/usr/local/bin:"* ]]; then
  echo "FATAL: /usr/local/bin not in dash default PATH ('$_default_path')." >&2
  echo "Non-login toolchain resolution would break on this base image." >&2
  exit 1
fi

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
  # Validate the sudoers fragment before installing it (a syntax error in
  # /etc/sudoers.d/* can disable sudo entirely), and keep it 0440 root:root —
  # sudo rejects world-readable drop-ins.
  _sudoers_tmp="$(mktemp)"
  printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$AGENT_USER" > "$_sudoers_tmp"
  visudo -cf "$_sudoers_tmp"
  install -m 0440 -o root -g root "$_sudoers_tmp" "/etc/sudoers.d/90-$AGENT_USER"
  rm -f "$_sudoers_tmp"
else
  log "Using existing user: $AGENT_USER (setting login shell to zsh)"
  chsh -s /usr/bin/zsh "$AGENT_USER" 2>/dev/null || usermod -s /usr/bin/zsh "$AGENT_USER"
fi

# ---- 3. mise (pinned + checksum-verified, per-user) -----------------------
# mise is the only third-party code the bake installs, run as the agent user
# (which has passwordless sudo). Instead of `curl https://mise.run | sh` — live,
# unpinned remote code whose resolved version drifts day to day — we download
# the exact release binary and verify its SHA256 against the in-repo pin BEFORE
# installing. The bake then has no unverified live dependency: a DNS/CDN
# compromise can't poison the 14 clones. Installed per-user (~/.local), never
# root's tree. Re-install only when the installed version != the pin.
mise_installed=""
if [[ -x "$MISE_BIN" ]]; then
  mise_installed="$(as_agent "$MISE_BIN" version 2>/dev/null | awk '{print $1}')" || true
fi
if [[ "$mise_installed" != "${MISE_VERSION#v}" ]]; then
  log "Installing mise ${MISE_VERSION} (checksum-verified) for $AGENT_USER"
  as_agent install -d "$AGENT_HOME/.local/bin"
  _mise_tmp="$(as_agent mktemp)"
  as_agent curl -fsSL -o "$_mise_tmp" \
    "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-linux-x64"
  echo "${MISE_SHA256}  ${_mise_tmp}" | sha256sum -c -
  as_agent install -m 0755 "$_mise_tmp" "$MISE_BIN"
  rm -f "$_mise_tmp"
else
  log "mise ${MISE_VERSION} already present — skipping"
fi

# ---- 4. Node via mise (per-user, pinned to exact patch) -------------------
# Node is pinned to the exact semver in $NODE_VERSION so two bakes on different
# days install byte-identical Node. The post-install assert fails the bake if
# mise resolved anything other than the pin (also serves as the "node works for
# the agent user" check).
log "Pinning node@${NODE_VERSION} via mise (global)"
as_agent "$MISE_BIN" use -g "node@${NODE_VERSION}"
as_agent "$MISE_BIN" reshim   # ensure node/npm/npx shims exist before we use npm

node_v="$(as_agent node -v 2>/dev/null)" || true
if [[ "$node_v" != "v${NODE_VERSION}" ]]; then
  echo "FATAL: node ${NODE_VERSION} expected, got '${node_v:-<none>}'." >&2
  exit 1
fi

# ---- 5. OpenClaw (pinned, via the mise-managed Node) ----------------------
# Installed with the mise npm, so it lands in mise's node prefix; `mise reshim`
# then generates an `openclaw` shim alongside node/npm. Guarded on an EXACT
# version match (parse the last token of `openclaw --version`) so a future
# 2026.6.50 can't substring-match 2026.6.5 and skip a needed reinstall.
current_oc="$(as_agent openclaw --version 2>/dev/null | awk '{print $NF}')" || true
if [[ "$current_oc" != "$OPENCLAW_VERSION" ]]; then
  log "Installing openclaw@${OPENCLAW_VERSION}"
  as_agent npm install -g "openclaw@${OPENCLAW_VERSION}"
  as_agent "$MISE_BIN" reshim
else
  log "openclaw@${OPENCLAW_VERSION} already present — skipping"
fi

# ---- 6. Wire the toolchain into /usr/local/bin (non-login resolution) ------
# A non-login, non-interactive launcher (systemd unit, `ssh host openclaw ...`
# with no TTY, or `env -i sh -c 'openclaw --version'`) never sources zshrc, so
# it never runs `mise activate`. To make `node`/`npm`/`npx`/`openclaw` resolve
# anyway, we symlink the per-user mise *shims* into /usr/local/bin, which is on
# dash's default PATH (asserted in preflight) so even a stripped `env -i
# /bin/sh` finds them. The shims are themselves the mise binary; invoked by
# basename they re-exec the right tool. mise locates the agent user's install
# tree from the uid's passwd entry, so resolution works even when $HOME is unset
# — though production launchers should still set HOME=/home/ubuntu (systemd
# `User=ubuntu` does) so resolution never depends on that fallback.
log "Symlinking mise shims into /usr/local/bin"
ln -sf "$MISE_BIN" /usr/local/bin/mise
for shim in node npm npx openclaw; do
  ln -sf "$SHIMS_DIR/$shim" "/usr/local/bin/$shim"
done

# ---- 7. Shell environment (the "dotfiles" layer) -------------------------
# The shell/ dir is asserted present in preflight, so a profile-less bake is
# impossible by this point.
log "Linking shell config for $AGENT_USER"
for rc in zshrc zshenv; do
  install -m 0644 -o "$AGENT_USER" -g "$AGENT_USER" \
    "$SCRIPT_DIR/shell/$rc" "$AGENT_HOME/.$rc"
done

# ---- 8. Verify the bake ---------------------------------------------------
# Canonical non-login resolution gate: a stripped environment (no PATH, no HOME)
# must resolve the WHOLE toolchain via the /usr/local/bin shims. Covers all the
# shims we wired (node/npm/openclaw) — a dangling shim fails the bake here,
# loudly, rather than silently in class. Runs AS the agent user, since the
# symlinks resolve to that user's mise tree (root would resolve /root → nothing).
log "Verifying non-login resolution (stripped env, as $AGENT_USER)"
sudo -u "$AGENT_USER" env -i /bin/sh -c 'node -v && npm -v && openclaw --version'

log "Bake complete. Snapshot this server now."
log "  hcloud server create-image <name> --type snapshot --description goto2026-golden"
