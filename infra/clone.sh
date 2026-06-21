#!/usr/bin/env bash
# infra/clone.sh — render the per-instance cloud-init for the GOTO 2026 lab.
#
# For each host (instances.txt by default, or hostnames passed as args) this
# substitutes ALL placeholders in infra/cloud-init/template.yaml:
#     {{HOSTNAME}} {{OPENCLAW_API_KEY_B64}} {{DESKTOP_USER}} {{DESKTOP_PASS}}
#     {{TUNNEL_SALT}} {{CLOUDFLARED_TOKEN}} {{POSTGRES_APP_PASSWORD}}
# and writes a ready-to-boot cloud-init file plus a credential manifest into a
# GITIGNORED output dir (infra/cloud-init/generated/). The golden snapshot has
# NO student secret in it; this script is the only place per-box secrets exist,
# and they only ever land in that gitignored dir (and, at boot, on the box).
#
# Desktop credential model (FR-4):
#   - DESKTOP_USER is a stable convention ("student") so the login is the same
#     to communicate on every card; only the password is per-box.
#   - DESKTOP_PASS is a freshly generated strong secret, unique per box.
#   The baked openclaw-desktop-cred.service consumes /etc/openclaw/desktop.env
#   at first boot and builds the nginx bcrypt htpasswd from it.
#
# OpenClaw API key: sourced via a documented STUB here (real provisioning is the
# credential-bag loop). Default source emits a clearly-fake placeholder so no
# real key is ever required to render; override OPENCLAW_API_KEY_SOURCE=env|op.
#
# Cloudflare Tunnel secrets (TUNNEL_SALT, CLOUDFLARED_TOKEN) + POSTGRES_APP_PASSWORD
# are FLEET-WIDE (the same value for every box — only the hostname varies the
# per-box subdomain hash), so they are read ONCE up front, not generated per host.
# Same stub|env|op source model as the API key, gated by ALLOW_STUB for the stub.
#
# Idempotent: re-running reuses any desktop password already recorded in the
# manifest for a host (so already-distributed creds stay valid) and only
# generates one for hosts that don't have one yet. Pass --force to rotate all.
#
# Usage:
#   infra/clone.sh                 # render every host in instances.txt
#   infra/clone.sh pikachu gengar  # render only these (handy for a test host)
#   infra/clone.sh --force         # rotate every desktop password
#
# Env:
#   DESKTOP_USER            override the desktop username (default: student)
#   OPENCLAW_API_KEY_SOURCE stub (default) | env | op
#   ALLOW_STUB              set to 1 to permit a stub source (dev/test only); gates
#                           BOTH the API key and the tunnel-secrets stub
#   OPENCLAW_API_KEY        used when OPENCLAW_API_KEY_SOURCE=env
#   OP_API_KEY_ITEM         used when OPENCLAW_API_KEY_SOURCE=op (op:// ref)
#   TUNNEL_SECRETS_SOURCE   stub (default) | env | op  (fleet-wide tunnel secrets)
#   TUNNEL_SALT             used when TUNNEL_SECRETS_SOURCE=env (alphanumeric)
#   CLOUDFLARED_TOKEN       used when TUNNEL_SECRETS_SOURCE=env
#   POSTGRES_APP_PASSWORD   used when TUNNEL_SECRETS_SOURCE=env
#   OP_TUNNEL_SALT_ITEM     used when TUNNEL_SECRETS_SOURCE=op (op:// ref)
#   OP_CLOUDFLARED_TOKEN_ITEM   used when TUNNEL_SECRETS_SOURCE=op (op:// ref)
#   OP_POSTGRES_APP_PASSWORD_ITEM   used when TUNNEL_SECRETS_SOURCE=op (op:// ref)

set -euo pipefail

# --- paths -------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SCRIPT_DIR/cloud-init/template.yaml"
INSTANCES="$REPO_ROOT/instances.txt"
OUT_DIR="$SCRIPT_DIR/cloud-init/generated"
MANIFEST="$OUT_DIR/credentials-manifest.tsv"

# --- config ------------------------------------------------------------------
DESKTOP_USER="${DESKTOP_USER:-student}"
OPENCLAW_API_KEY_SOURCE="${OPENCLAW_API_KEY_SOURCE:-stub}"
TUNNEL_SECRETS_SOURCE="${TUNNEL_SECRETS_SOURCE:-stub}"
ALLOW_STUB="${ALLOW_STUB:-0}"
FORCE=0

# Validation patterns for values that flow into YAML and shell on the box.
#   - hostname: RFC 1123 label (lowercase, starts alnum-letter, 2-63 chars).
#   - desktop user: a conservative POSIX-ish username, sourced as root at boot.
#   - tunnel salt: hex/alphanumeric only — it is concatenated with the hostname
#     and sha256'd on the box, and lands in a shell .env, so keep it shell-safe.
HOSTNAME_RE='^[a-z][a-z0-9-]{1,62}$'
DESKTOP_USER_RE='^[a-z_][a-z0-9_-]{0,31}$'
TUNNEL_SALT_RE='^[A-Za-z0-9]{8,128}$'

# --- helpers -----------------------------------------------------------------
die()  { echo "clone.sh: $*" >&2; exit 1; }
warn() { echo "clone.sh: $*" >&2; }

# Strong, card-friendly password: 20 alphanumerics (~119 bits). Alnum-only so it
# survives a browser basic-auth prompt, a shell .env line, and a printed card
# without quoting surprises. Process substitution keeps `head` closing the pipe
# from tripping `set -o pipefail` on `tr`.
gen_password() {
  head -c 20 < <(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom)
}

# Documented stub for the per-instance OpenClaw API key. The credential-bag loop
# replaces this with a real lookup; until then `stub` keeps rendering secret-free.
fetch_api_key() {
  local host="$1"
  case "$OPENCLAW_API_KEY_SOURCE" in
    stub)
      printf 'REPLACE_ME__openclaw_api_key_for_%s' "$host"
      ;;
    env)
      [[ -n "${OPENCLAW_API_KEY:-}" ]] \
        || die "OPENCLAW_API_KEY_SOURCE=env but OPENCLAW_API_KEY is unset"
      printf '%s' "$OPENCLAW_API_KEY"
      ;;
    op)
      command -v op >/dev/null 2>&1 \
        || die "OPENCLAW_API_KEY_SOURCE=op but the 1Password CLI (op) is not installed"
      [[ -n "${OP_API_KEY_ITEM:-}" ]] \
        || die "OPENCLAW_API_KEY_SOURCE=op but OP_API_KEY_ITEM (op:// ref) is unset"
      op read "$OP_API_KEY_ITEM"
      ;;
    *)
      die "unknown OPENCLAW_API_KEY_SOURCE='$OPENCLAW_API_KEY_SOURCE' (want: stub|env|op)"
      ;;
  esac
}

# Fetch a fleet-wide tunnel secret per TUNNEL_SECRETS_SOURCE. Generic over the
# three values: pass a human label, the stub placeholder, the env var NAME (read
# indirectly), and the op:// item env var NAME. Read ONCE (not per host) — these
# are identical across the fleet. Stub mode emits an obviously-non-secret value
# that still passes the unsubstituted-placeholder check (gated by ALLOW_STUB).
fetch_tunnel_secret() {
  local label="$1" stub="$2" env_var="$3" op_var="$4"
  case "$TUNNEL_SECRETS_SOURCE" in
    stub)
      printf '%s' "$stub"
      ;;
    env)
      [[ -n "${!env_var:-}" ]] \
        || die "TUNNEL_SECRETS_SOURCE=env but $env_var ($label) is unset"
      printf '%s' "${!env_var}"
      ;;
    op)
      command -v op >/dev/null 2>&1 \
        || die "TUNNEL_SECRETS_SOURCE=op but the 1Password CLI (op) is not installed"
      [[ -n "${!op_var:-}" ]] \
        || die "TUNNEL_SECRETS_SOURCE=op but $op_var ($label, op:// ref) is unset"
      op read "${!op_var}"
      ;;
    *)
      die "unknown TUNNEL_SECRETS_SOURCE='$TUNNEL_SECRETS_SOURCE' (want: stub|env|op)"
      ;;
  esac
}

# Reuse a previously-issued desktop password for a host (idempotency), else "".
existing_password() {
  local host="$1"
  [[ -f "$MANIFEST" ]] || { printf ''; return; }
  # manifest columns: hostname \t desktop_user \t desktop_pass \t api_key_source
  awk -F'\t' -v h="$host" '$1==h {print $3; exit}' "$MANIFEST"
}

# --- validate config ---------------------------------------------------------
# Fail fast on a stub key (M5): the stub renders a placeholder that passes the
# unsubstituted-placeholder check, so a fleet render that forgot to set a real
# source would silently ship 14 broken boxes. Require an explicit opt-in.
if [[ "$OPENCLAW_API_KEY_SOURCE" == "stub" && "$ALLOW_STUB" != "1" ]]; then
  die "stub API key source requires ALLOW_STUB=1. Set a real key source (OPENCLAW_API_KEY_SOURCE=env|op) or ALLOW_STUB=1 for dev/test only."
fi

# Same fail-fast gate for the tunnel-secrets stub: a stub salt/token renders a
# placeholder that passes the unsubstituted-placeholder check, so a fleet render
# that forgot a real source would ship 14 boxes with a dead Cloudflare connector.
if [[ "$TUNNEL_SECRETS_SOURCE" == "stub" && "$ALLOW_STUB" != "1" ]]; then
  die "stub tunnel-secrets source requires ALLOW_STUB=1. Set a real source (TUNNEL_SECRETS_SOURCE=env|op) or ALLOW_STUB=1 for dev/test only."
fi

# DESKTOP_USER is substituted into /etc/openclaw/desktop.env and sourced as root
# at first boot (M4); reject anything outside a safe username shape.
[[ "$DESKTOP_USER" =~ $DESKTOP_USER_RE ]] \
  || die "invalid DESKTOP_USER '$DESKTOP_USER' (must match $DESKTOP_USER_RE)"

# Read the fleet-wide tunnel secrets ONCE (same value for every box) and validate
# them before rendering anything. These flow into /etc/openclaw/tunnel.env on the
# box; reject shapes that would break the shell .env or the on-box hash.
tunnel_salt="$(fetch_tunnel_secret 'TUNNEL_SALT' \
  'stubsalt00000000deadbeef' 'TUNNEL_SALT' 'OP_TUNNEL_SALT_ITEM')"
cloudflared_token="$(fetch_tunnel_secret 'CLOUDFLARED_TOKEN' \
  'REPLACE_ME_cloudflared_connector_token' 'CLOUDFLARED_TOKEN' 'OP_CLOUDFLARED_TOKEN_ITEM')"
postgres_app_password="$(fetch_tunnel_secret 'POSTGRES_APP_PASSWORD' \
  'REPLACE_ME_postgres_app_password' 'POSTGRES_APP_PASSWORD' 'OP_POSTGRES_APP_PASSWORD_ITEM')"

# Salt is concatenated with the hostname and sha256'd on the box, and lands in a
# shell .env — keep it strictly hex/alphanumeric.
[[ "$tunnel_salt" =~ $TUNNEL_SALT_RE ]] \
  || die "invalid TUNNEL_SALT (must match $TUNNEL_SALT_RE — hex/alphanumeric, 8-128 chars)"
# Token + Postgres password are opaque, but a CR/LF would corrupt the .env block
# (and is almost always a copy-paste artifact); reject it loudly up front.
[[ "$cloudflared_token" == *$'\n'* || "$cloudflared_token" == *$'\r'* ]] \
  && die "CLOUDFLARED_TOKEN contains CR/LF; refusing to render"
[[ "$postgres_app_password" == *$'\n'* || "$postgres_app_password" == *$'\r'* ]] \
  && die "POSTGRES_APP_PASSWORD contains CR/LF; refusing to render"

# --- arg parse ---------------------------------------------------------------
hosts=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,52p' "${BASH_SOURCE[0]}"; exit 0 ;;
    --*) die "unknown flag: $a" ;;
    *) hosts+=("$a") ;;
  esac
done

[[ -f "$TEMPLATE" ]] || die "template not found: $TEMPLATE"

# Default host list = instances.txt (strip comments / blanks / whitespace).
if [[ ${#hosts[@]} -eq 0 ]]; then
  [[ -f "$INSTANCES" ]] || die "instances.txt not found: $INSTANCES"
  while IFS= read -r line; do
    line="${line%%#*}"
    line="${line//[[:space:]]/}"
    [[ -n "$line" ]] && hosts+=("$line")
  done < "$INSTANCES"
fi
[[ ${#hosts[@]} -gt 0 ]] || die "no hosts to render"

# Validate + de-duplicate hostnames before rendering anything. A bad hostname
# flows into a `runcmd` hostnamectl call and the cloud-init YAML (M2); a repeated
# one would overwrite its own cloud-init and write conflicting manifest rows (m4).
declare -A _seen_hosts=()
for host in "${hosts[@]}"; do
  [[ "$host" =~ $HOSTNAME_RE ]] \
    || die "invalid hostname '$host' (must match RFC 1123: $HOSTNAME_RE)"
  [[ -n "${_seen_hosts[$host]:-}" ]] && die "duplicate hostname in input: '$host'"
  _seen_hosts["$host"]=1
done

# --- render ------------------------------------------------------------------
mkdir -p "$OUT_DIR"
chmod 0700 "$OUT_DIR"

template="$(cat "$TEMPLATE")"

# Carry forward existing manifest entries for hosts we are NOT re-rendering this
# run, so a targeted/partial render doesn't drop other boxes' recorded creds.
selected=" ${hosts[*]} "
tmp_manifest="$(mktemp "${TMPDIR:-/tmp}/clone-manifest.XXXXXX")"
trap 'rm -f "$tmp_manifest"' EXIT
{
  printf '# GOTO 2026 lab credential manifest — SECRET, gitignored, do not commit.\n'
  printf '# Generated by infra/clone.sh. Feeds the QR/Gist delivery loop.\n'
  printf '# hostname\tdesktop_user\tdesktop_pass\tapi_key_source\n'
} > "$tmp_manifest"

if [[ -f "$MANIFEST" ]]; then
  while IFS=$'\t' read -r m_host m_user m_pass m_src; do
    [[ "$m_host" == \#* || -z "$m_host" ]] && continue
    [[ "$selected" == *" $m_host "* ]] && continue   # re-rendered below
    printf '%s\t%s\t%s\t%s\n' "$m_host" "$m_user" "$m_pass" "$m_src" >> "$tmp_manifest"
  done < "$MANIFEST"
fi

for host in "${hosts[@]}"; do
  pass=""
  if [[ "$FORCE" -eq 0 ]]; then
    pass="$(existing_password "$host")"
  fi
  if [[ -z "$pass" ]]; then
    pass="$(gen_password)"
  fi

  api_key="$(fetch_api_key "$host")"
  # Reject CR/LF in the key up front (M3): defense in depth even though the key
  # is base64-encoded below — a newline in the source key is almost always a
  # copy-paste artifact, and failing loudly beats silently encoding a bad key.
  [[ "$api_key" == *$'\n'* || "$api_key" == *$'\r'* ]] \
    && die "OpenClaw API key for '$host' contains CR/LF; refusing to render"
  # Encode as a single base64 line so it lands in the cloud-init write_files
  # block (encoding: b64) as one safe scalar regardless of the key's bytes.
  api_key_b64="$(printf '%s' "$api_key" | base64 | tr -d '\n')"

  rendered="${template//\{\{HOSTNAME\}\}/$host}"
  rendered="${rendered//\{\{OPENCLAW_API_KEY_B64\}\}/$api_key_b64}"
  rendered="${rendered//\{\{DESKTOP_USER\}\}/$DESKTOP_USER}"
  rendered="${rendered//\{\{DESKTOP_PASS\}\}/$pass}"
  # Fleet-wide tunnel secrets (same for every host; read once above).
  rendered="${rendered//\{\{TUNNEL_SALT\}\}/$tunnel_salt}"
  rendered="${rendered//\{\{CLOUDFLARED_TOKEN\}\}/$cloudflared_token}"
  rendered="${rendered//\{\{POSTGRES_APP_PASSWORD\}\}/$postgres_app_password}"

  if printf '%s' "$rendered" | grep -q '{{.*}}'; then
    die "unsubstituted placeholder left in render for '$host'"
  fi

  out="$OUT_DIR/$host.cloud-init.yaml"
  printf '%s\n' "$rendered" > "$out"
  chmod 0600 "$out"

  printf '%s\t%s\t%s\t%s\n' \
    "$host" "$DESKTOP_USER" "$pass" "$OPENCLAW_API_KEY_SOURCE" >> "$tmp_manifest"

  echo "rendered $out (user=$DESKTOP_USER, api_key_source=$OPENCLAW_API_KEY_SOURCE)"
done

mv "$tmp_manifest" "$MANIFEST"
trap - EXIT
chmod 0600 "$MANIFEST"

echo "clone.sh: ${#hosts[@]} host(s) rendered to $OUT_DIR"
echo "clone.sh: credential manifest at $MANIFEST (SECRET — gitignored)"
echo "clone.sh: tunnel secrets source=$TUNNEL_SECRETS_SOURCE (fleet-wide; same salt/token on every box)"
