# loop-009 — Bootstrap Modularity + Security Hardening

Read `references/MERGED-REVIEW.md` first — it contains the full findings from the Codex review of `dotfiles/bootstrap.sh`, `infra/clone.sh`, and `infra/cloud-init/template.yaml`.

## Context

These scripts provision 14 student Hetzner VPS boxes (Ubuntu 24.04.4, ccx33) for a GOTO 2026 masterclass. Box #1 (`87.99.153.105`) is live and recipe-green. The changes in this loop must not break the live box — all changes are tested conceptually against the known-good state from loop-006.

The two goals of this loop are independent and should be committed separately:
1. **Security fixes** (Phase A) — fix the nginx critical + clone.sh injection risks
2. **Modularity** (Phase B) — refactor bootstrap.sh into phase functions

## Phase A — Security fixes

### A1: nginx — bind to localhost only
`dotfiles/desktop/openclaw-desktop.nginx`
Change `listen 8080;` to `listen 127.0.0.1:8080;` (and `listen [::1]:8080;` if an IPv6 line exists).
Tailscale Funnel will proxy to localhost — this is the intended architecture.

After editing, add a bake-time assertion at the end of the `phase_verify` function (see Phase B) or at the end of the current verify block:
```bash
if ss -ltnp 2>/dev/null | grep -q ':8080.*0.0.0.0\|:8080.*:::'; then
  log "FATAL: nginx is listening on a public interface — bake failed" >&2
  exit 1
fi
log "nginx :8080 bound to localhost only ✓"
```

### A2: Validate INSTANCE_NAME in clone.sh
`infra/clone.sh` — before the rendering loop, add validation:
```bash
validate_hostname() {
  local name="$1"
  if [[ ! "$name" =~ ^[a-z][a-z0-9-]{1,62}$ ]]; then
    echo "ERROR: invalid hostname '$name' — must match ^[a-z][a-z0-9-]{1,62}$" >&2
    exit 1
  fi
}
```
Call `validate_hostname "$INSTANCE_NAME"` before substitution. Also add duplicate detection: track seen names in an associative array and fail on collision.

### A3: Base64-encode API key in cloud-init
`infra/cloud-init/template.yaml` — the `write_files` block that writes `/etc/openclaw/.env` (or wherever the API key is written):
Change from a plain block scalar substitution to base64:
```yaml
write_files:
  - path: /etc/openclaw/.env
    encoding: b64
    content: {{OPENCLAW_API_KEY_B64}}
    permissions: '0600'
    owner: root:root
```
In `infra/clone.sh`, change the substitution to:
```bash
local api_key_b64
api_key_b64=$(printf '%s' "$api_key" | base64 | tr -d '\n')
# then substitute {{OPENCLAW_API_KEY_B64}} instead of {{OPENCLAW_API_KEY}}
```
Validate that the raw key contains no CR/LF before encoding (fail if it does — this indicates a key encoding problem upstream).

### A4: Validate and quote DESKTOP_USER
`infra/clone.sh` — add validation:
```bash
validate_username() {
  local name="$1"
  if [[ ! "$name" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
    echo "ERROR: invalid DESKTOP_USER '$name'" >&2; exit 1
  fi
}
```
In `infra/cloud-init/template.yaml`, ensure `DESKTOP_USER` is used only in contexts where it's quoted: `"{{DESKTOP_USER}}"` in any shell command within runcmd.

### A5: Fail on stub API key by default
`infra/clone.sh` — in `fetch_api_key`, change the stub branch:
```bash
stub)
  if [[ "${ALLOW_STUB:-0}" != "1" ]]; then
    echo "ERROR: OPENCLAW_API_KEY_SOURCE=stub requires ALLOW_STUB=1 for non-test renders" >&2
    exit 1
  fi
  echo "STUB-KEY-REPLACE-ME"
  ;;
```

### A6: Delete desktop.env after htpasswd written
`dotfiles/desktop/openclaw-desktop-cred.sh` (or wherever the first-boot unit runs) — after the `htpasswd` command succeeds, add:
```bash
rm -f /etc/openclaw/desktop.env
log "Removed plaintext desktop.env after htpasswd generation"
```
Add a guard so the unit is idempotent: if `/etc/nginx/.htpasswd` already exists, skip and exit 0. This makes it truly first-boot behavior.

**Commit A:** `fix(infra): harden nginx binding, validate clone.sh inputs, secure cred lifecycle`

## Phase B — Modularity refactor

### B1: Refactor bootstrap.sh into phase functions

The current script has good section comments (`# ===`) but is imperative waterfall. Refactor into named functions while preserving identical behavior.

**Structure:**
```bash
#!/usr/bin/env bash
set -euo pipefail

# ── config ──────────────────────────────────────────────────────
AGENT_USER="${AGENT_USER:-ubuntu}"
AGENT_HOME="/home/${AGENT_USER}"
OPENCLAW_VERSION="2026.6.5"
NODE_VERSION="22.23.0"
MISE_VERSION="v2026.6.11"
MISE_SHA256="..."  # keep existing
STAMP_DIR="/var/lib/bake"

# ── utilities ───────────────────────────────────────────────────
log()   { echo "[bake] $*"; }
fatal() { echo "[bake] FATAL: $*" >&2; exit 1; }

stamped() {
  local phase="$1"; shift
  local stamp="$STAMP_DIR/${phase}.done"
  if [[ -f "$stamp" && "${FORCE:-0}" != "1" ]]; then
    log "phase ${phase}: already done (stamp exists) — skipping"
    return 0
  fi
  mkdir -p "$STAMP_DIR"
  log "phase ${phase}: starting"
  "$@"
  touch "$stamp"
  log "phase ${phase}: done ✓"
}

# ── phases ──────────────────────────────────────────────────────
phase_base() {
  # apt packages, locale, sysctl (vm.max_map_count), ufw/firewall prep
  # everything currently in the "BASE" section of bootstrap.sh
}

phase_toolchain() {
  # mise install + SHA256 verify
  # Node 22.23.0 via mise
  # /usr/local/bin shims
  # OpenClaw install + version guard
  # Claude Code CLI
  # Codex CLI
  # shell tools (fzf, eza, bat, fd, gh, starship)
  # oh-my-zsh + classroom zshrc/zshenv
}

phase_desktop() {
  # Xfce + TigerVNC
  # websockify
  # nginx config (now 127.0.0.1:8080 after A1)
  # VNC systemd unit
  # websockify systemd unit
  # nginx systemd unit
  # first-boot cred unit (openclaw-desktop-cred.service)
}

phase_docker() {
  # Docker CE + compose plugin (deepened guard from M7)
  # vm.max_map_count sysctl (if not already in phase_base)
  # docker-compose.yml for SonarQube CE + Postgres
  # sonarqube-stack systemd unit
}

phase_verify() {
  # env -i gate (node, npm, openclaw)
  # desktop 401 probe
  # docker version + docker compose version
  # SonarQube API poll (up to 60s)
  # nginx localhost-only assertion (A1)
  log "All verifications passed ✓"
}

# ── main ────────────────────────────────────────────────────────
PHASE="${1:-all}"
FORCE="${FORCE:-0}"

case "$PHASE" in
  all)
    stamped base       phase_base
    stamped toolchain  phase_toolchain
    stamped desktop    phase_desktop
    stamped docker     phase_docker
    stamped verify     phase_verify
    ;;
  base|toolchain|desktop|docker|verify)
    stamped "$PHASE" "phase_${PHASE}"
    ;;
  *)
    fatal "Unknown phase '$PHASE'. Valid: all base toolchain desktop docker verify"
    ;;
esac
```

**Important:** preserve ALL existing logic exactly — just move it into functions. The only behavioral changes in this commit are the stamp-file skip logic and the `--phase` argument. Security fixes from Phase A should already be committed before this.

**Commit B:** `refactor(infra): modularize bootstrap.sh into phase functions with stamp-file support`

## What NOT to change in this loop

- `infra/terraform/` — no Terraform changes
- `infra/clone.sh` hostname roster (`instances.txt`) — no changes
- The 14-instance names — no changes
- Any `.cc-dispatch/` files — no changes
- Anything in `skills/` — that's loop-008's scope

## Verification

After Phase A commit:
```bash
grep "listen" dotfiles/desktop/openclaw-desktop.nginx
# must show: listen 127.0.0.1:8080;
# must NOT show: listen 8080; (unbound)
```

After Phase B commit:
```bash
bash -n dotfiles/bootstrap.sh  # syntax check
grep -c "^phase_" dotfiles/bootstrap.sh  # should be ≥ 5
grep "stamped" dotfiles/bootstrap.sh | wc -l  # should be ≥ 5
```

Also confirm stamp logic works dry-run style:
```bash
# Simulating: create a fake stamp, verify skip
STAMP_DIR=/tmp/bake-test FORCE=0 bash -c '
  source dotfiles/bootstrap.sh
  mkdir -p $STAMP_DIR
  touch $STAMP_DIR/base.done
  stamped base phase_base && echo "PASS: stamp skipped base"
'
```
