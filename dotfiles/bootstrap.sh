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
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# The bake copies on-disk assets: the shell profiles (shell/), the desktop
# units + nginx site (desktop/), and the Docker service stack (infra/services/).
# A curl|bash or partial checkout leaves these absent → a silently broken box.
# Require them all up front.
for _need in "$SCRIPT_DIR/shell" "$SCRIPT_DIR/desktop" "$REPO_ROOT/infra/services"; do
  if [[ ! -d "$_need" ]]; then
    echo "FATAL: '$_need' not found." >&2
    echo "Run from a repo checkout (git clone … && bash dotfiles/bootstrap.sh)," >&2
    echo "NOT piped over curl|bash — the bake's on-disk assets must exist." >&2
    exit 1
  fi
done

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
# version match so a future 2026.6.50 can't substring-match 2026.6.5 and skip a
# needed reinstall. The binary prints `OpenClaw 2026.6.5 (5181e4f)` — extract the
# first semver token (NOT $NF, which is the trailing git hash, so the guard would
# never match and we'd reinstall over the network on every bake).
current_oc="$(as_agent openclaw --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)" || true
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

# ---- 8. Browser desktop: Xfce + TigerVNC + noVNC + nginx auth (FR-4) -------
# The lab's heaviest bake-once layer. Chain: Xfce session on a loopback-only
# TigerVNC display (:1) → websockify bridges VNC to a browser WebSocket (6080,
# loopback) → nginx reverse-proxies 8080 with HTTP basic-auth. Tailscale Funnel
# (a later loop) fronts 8080 and terminates TLS; here we only make the local
# chain correct. The per-student htpasswd is NOT baked — it's written at first
# boot by openclaw-desktop-cred.service from a cloud-init-dropped credential, so
# the snapshot carries no secret and nginx fails closed until creds land.
log "Installing desktop stack (Xfce + TigerVNC + noVNC + nginx)"
apt-get install -y -qq \
  xfce4 xfce4-terminal dbus-x11 \
  tigervnc-standalone-server tigervnc-common \
  novnc websockify \
  nginx apache2-utils

log "Installing desktop session + service units"
install -d -o "$AGENT_USER" -g "$AGENT_USER" -m 0755 "$AGENT_HOME/.vnc"
install -m 0755 -o "$AGENT_USER" -g "$AGENT_USER" \
  "$SCRIPT_DIR/desktop/xstartup" "$AGENT_HOME/.vnc/xstartup"
install -m 0755 "$SCRIPT_DIR/desktop/openclaw-desktop-cred.sh" \
  /usr/local/sbin/openclaw-desktop-cred.sh
for unit in openclaw-desktop-vnc openclaw-desktop-novnc openclaw-desktop-cred; do
  install -m 0644 "$SCRIPT_DIR/desktop/$unit.service" "/etc/systemd/system/$unit.service"
done

log "Configuring nginx basic-auth reverse proxy for noVNC"
# Auth-gated landing page served at `/` (static, so basic-auth applies — see the
# nginx site for why this isn't a `return 302`). JS-redirects into noVNC.
install -d -m 0755 /usr/share/openclaw-desktop
install -m 0644 "$SCRIPT_DIR/desktop/index.html" \
  /usr/share/openclaw-desktop/index.html
install -m 0644 "$SCRIPT_DIR/desktop/openclaw-desktop.nginx" \
  /etc/nginx/sites-available/openclaw-desktop
ln -sf /etc/nginx/sites-available/openclaw-desktop \
  /etc/nginx/sites-enabled/openclaw-desktop
rm -f /etc/nginx/sites-enabled/default   # drop the stock welcome site

# Enable (not necessarily start) the chain so it comes up on every boot. nginx
# is socket-bound and harmless to start now; the VNC/websockify units come up on
# the real box's boot. None of this pulls or spends.
systemctl daemon-reload
systemctl enable openclaw-desktop-vnc.service openclaw-desktop-novnc.service \
  openclaw-desktop-cred.service nginx

# The nginx apt package starts a daemon at install time with the STOCK config —
# before our site existed. Enabling alone leaves that running daemon listening on
# the default :80 and ignorant of our :8080 site until a reboot. A fresh clone
# boots nginx with the baked config already present (correct), but the bake's own
# nginx (and any re-bake on a live box) must be made to adopt the new site now.
# restart, not reload: a new `listen 8080` is picked up cleanly on a full restart.
# It fails closed (no htpasswd yet) so starting it exposes nothing.
systemctl restart nginx

# ---- 9. Docker service stack: SonarQube CE + Postgres (FR-3) ---------------
# Docker CE from the official apt repo (idempotent: only added once), the agent
# user in the `docker` group (intentional root-equivalent access — single-student
# box, per PRD FR-3 security note), and the SonarQube Elasticsearch sysctl baked
# in. The compose stack + a systemd unit are laid down but NOT pulled/started —
# the bake never touches the network for images; the unit brings them up on the
# real box's first boot.
if ! command -v docker &>/dev/null; then
  log "Installing Docker CE (official apt repo)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  _arch="$(dpkg --print-architecture)"
  # shellcheck disable=SC1091  # /etc/os-release exists at bake time, not lint time
  _codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$_arch signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $_codename stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  log "Docker already installed — skipping repo + install"
fi

# Agent user in the docker group (idempotent).
if ! id -nG "$AGENT_USER" | tr ' ' '\n' | grep -qx docker; then
  log "Adding $AGENT_USER to the docker group"
  usermod -aG docker "$AGENT_USER"
else
  log "$AGENT_USER already in docker group — skipping"
fi

# SonarQube's embedded Elasticsearch refuses to start without this. Bake it so
# it survives reboots; idempotent (same content each run).
log "Baking vm.max_map_count sysctl for SonarQube"
printf 'vm.max_map_count=262144\n' > /etc/sysctl.d/99-openclaw-sonarqube.conf
sysctl -p /etc/sysctl.d/99-openclaw-sonarqube.conf >/dev/null

log "Laying down the SonarQube + Postgres compose stack (not started)"
install -d -m 0750 /opt/openclaw/services
install -m 0644 "$REPO_ROOT/infra/services/compose.yml" /opt/openclaw/services/compose.yml
install -m 0755 "$REPO_ROOT/infra/services/openclaw-services-env.sh" \
  /usr/local/sbin/openclaw-services-env.sh
install -m 0644 "$REPO_ROOT/infra/services/openclaw-services.service" \
  /etc/systemd/system/openclaw-services.service
systemctl daemon-reload
systemctl enable openclaw-services.service   # enabled; first `up`+pull is on real boot

# ---- 10. Verify the bake --------------------------------------------------
# Canonical non-login resolution gate: a minimal, non-interactive environment
# must resolve the WHOLE toolchain via the /usr/local/bin shims. Covers all the
# shims we wired (node/npm/openclaw) — a dangling shim fails the bake here,
# loudly, rather than silently in class. Runs AS the agent user, since the
# symlinks resolve to that user's mise tree (root would resolve /root → nothing).
#
# We provide systemd's default PATH (DefaultEnvironment) but NO HOME — this is
# exactly the environment a `User=ubuntu` unit launches with. PATH must be a real
# environment variable here, not just dash's compiled-in fallback: node/openclaw
# shims are the mise ELF binary (exec'd directly), but npm chains through a
# `#!/usr/bin/env bash` wrapper whose shebang re-exec needs PATH *in the
# environment* to find bash. A bare `env -i /bin/sh -c …` (empty env, no exported
# PATH) makes that npm shebang fail — but no real launcher ships an empty PATH,
# so that scenario is moot. /usr/local/bin is the only place these three resolve
# from on this PATH (no system node/npm), so the shim wiring is still genuinely
# under test. HOME stays unset to assert mise's passwd-based install-tree lookup.
log "Verifying non-login resolution (systemd-like env, as $AGENT_USER)"
sudo -u "$AGENT_USER" env -i \
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  /bin/sh -c 'node -v && npm -v && openclaw --version'

# Static-validate the lab layer without pulling images or needing student creds.
log "Validating nginx config (nginx -t)"
nginx -t

log "Validating compose syntax (config only, no pull/up)"
# A throwaway value satisfies the ${SONAR_DB_PASSWORD:?} guard for parsing; the
# real internal password is generated on first boot, never here.
SONAR_DB_PASSWORD=bake-validation-only \
  docker compose -f /opt/openclaw/services/compose.yml config -q

log "Confirming lab units are enabled (not started here)"
systemctl is-enabled openclaw-desktop-vnc.service openclaw-desktop-novnc.service \
  openclaw-desktop-cred.service openclaw-services.service nginx

log "Bake complete. Snapshot this server now."
log "  hcloud server create-image <name> --type snapshot --description goto2026-golden"
