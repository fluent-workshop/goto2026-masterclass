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
# TUNNEL_SALT is FLEET-WIDE (the same value on every box; it only salts the
# per-box hostname hash). CLOUDFLARED_TOKEN and POSTGRES_APP_PASSWORD are
# PER-INSTANCE: each box has its OWN Cloudflare Tunnel token and its own Postgres
# password, both read from instance-secrets.toml (a gitignored file at repo root)
# keyed by hostname. Both are validated against a strict charset before they are
# written into a cloud-init .env that is later sourced by root on the box.
#
# Idempotent: re-running reuses any desktop password already recorded in the
# manifest for a host (so already-distributed creds stay valid) and only
# generates one for hosts that don't have one yet. Pass --force to rotate all.
#
# Provisioning (GCP): rendering is the default and is side-effect-free. Pass
# --provision (or PROVISION=1) to ALSO create one GCP instance per rendered host
# from the golden image, injecting that host's cloud-init as the `user-data`
# metadata key (GCE's cloud-init datasource reads it). This creates BILLABLE
# infrastructure, hence opt-in. We pivoted off Hetzner (dedicated vCPU quota) to
# GCP project goto2026-masterclass-500200; the golden image family is
# goto2026-golden (see loop-014).
#
# Usage:
#   infra/clone.sh                 # render every host in instances.txt
#   infra/clone.sh pikachu gengar  # render only these (handy for a test host)
#   infra/clone.sh --force         # rotate every desktop password
#   infra/clone.sh pikachu --provision   # render + create the GCP instance(s)
#
# Env:
#   DESKTOP_USER            override the desktop username (default: student)
#   OPENCLAW_API_KEY_SOURCE stub (default) | env | op
#   ALLOW_STUB              set to 1 to permit a stub source (dev/test only); gates
#                           BOTH the API key and the tunnel-secrets stub
#   OPENCLAW_API_KEY        used when OPENCLAW_API_KEY_SOURCE=env
#   OP_API_KEY_ITEM         used when OPENCLAW_API_KEY_SOURCE=op (op:// ref)
#   TUNNEL_SECRETS_SOURCE   stub (default) | env | op  (governs ONLY the
#                           fleet-wide TUNNEL_SALT below)
#   TUNNEL_SALT             used when TUNNEL_SECRETS_SOURCE=env (alphanumeric)
#   OP_TUNNEL_SALT_ITEM     used when TUNNEL_SECRETS_SOURCE=op (op:// ref)
#   (CLOUDFLARED_TOKEN and POSTGRES_APP_PASSWORD are PER-INSTANCE, read from
#    instance-secrets.toml — NOT from TUNNEL_SECRETS_SOURCE)
#
#   PROVISION               1 to create GCP instances after rendering (else 0)
#   GCP_PROJECT             GCP project (default: goto2026-masterclass-500200)
#   GCP_ZONE                instance zone (default: us-central1-a)
#   GCP_MACHINE_TYPE        machine type (default: n2-standard-8)
#   GCP_IMAGE_FAMILY        golden image family (default: goto2026-golden)
#   GCP_DISK_SIZE           boot disk size (default: 256GB)
#   GCP_DISK_TYPE           boot disk type (default: pd-balanced)
#   GCP_INSTANCE_PREFIX     instance name prefix (default: goto-)
#   GCP_SSH_USER            admin login injected via ssh-keys (default: cedric)
#   GCP_SSH_PUBKEY_PATH     admin public key (default: ~/.ssh/id_ed25519.pub)

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
PROVISION="${PROVISION:-0}"

# GCP provisioning config (only consulted when --provision / PROVISION=1). We
# pivoted off Hetzner to GCP project goto2026-masterclass-500200; the golden
# image lives in the SAME project, so --image-project == GCP_PROJECT.
GCP_PROJECT="${GCP_PROJECT:-goto2026-masterclass-500200}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"
GCP_MACHINE_TYPE="${GCP_MACHINE_TYPE:-n2-standard-8}"
GCP_IMAGE_FAMILY="${GCP_IMAGE_FAMILY:-goto2026-golden}"
GCP_DISK_SIZE="${GCP_DISK_SIZE:-256GB}"
GCP_DISK_TYPE="${GCP_DISK_TYPE:-pd-balanced}"
GCP_INSTANCE_PREFIX="${GCP_INSTANCE_PREFIX:-goto-}"
GCP_SSH_USER="${GCP_SSH_USER:-cedric}"
GCP_SSH_PUBKEY_PATH="${GCP_SSH_PUBKEY_PATH:-$HOME/.ssh/id_ed25519.pub}"

# Validation patterns for values that flow into YAML and shell on the box.
#   - hostname: RFC 1123 label (lowercase, starts alnum-letter, 2-63 chars).
#   - desktop user: a conservative POSIX-ish username, sourced as root at boot.
#   - tunnel salt: hex/alphanumeric only — it is concatenated with the hostname
#     and sha256'd on the box, and lands in a shell .env, so keep it shell-safe.
HOSTNAME_RE='^[a-z][a-z0-9-]{1,62}$'
DESKTOP_USER_RE='^[a-z_][a-z0-9_-]{0,31}$'
TUNNEL_SALT_RE='^[A-Za-z0-9]{8,128}$'
# Per-instance secrets flow into /etc/openclaw/tunnel.env, which is sourced by
# ROOT on the box at first boot. Validate them against a strict charset BEFORE
# substitution so a stray backtick, $(...), quote, or space in
# instance-secrets.toml can never become code executed as root.
#   - Cloudflare connector token: base64url-encoded JSON blob, always "eyJ…".
#   - Postgres app password: the generated 3-word passphrase (alnum + . _ -).
CLOUDFLARED_TOKEN_RE='^eyJ[A-Za-z0-9._=/+-]+$'
POSTGRES_APP_PASSWORD_RE='^[A-Za-z0-9._-]+$'

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

# Read the fleet-wide TUNNEL_SALT ONCE (same value for every box; used for
# per-box hash derivation on first boot). CLOUDFLARED_TOKEN is now PER-INSTANCE
# (each box gets its own tunnel) — fetched per-host via fetch_instance_cloudflared_token().
tunnel_salt="$(fetch_tunnel_secret 'TUNNEL_SALT' \
  'stubsalt00000000deadbeef' 'TUNNEL_SALT' 'OP_TUNNEL_SALT_ITEM')"

# Salt lands in a shell .env — keep it strictly hex/alphanumeric.
[[ "$tunnel_salt" =~ $TUNNEL_SALT_RE ]] \
  || die "invalid TUNNEL_SALT (must match $TUNNEL_SALT_RE — hex/alphanumeric, 8-128 chars)"
INSTANCE_SECRETS="$REPO_ROOT/instance-secrets.toml"
[[ -f "$INSTANCE_SECRETS" ]] \
  || die "instance-secrets.toml not found at $INSTANCE_SECRETS"

# Parse a per-instance value from instance-secrets.toml.
# Sections look like: [pikachu] / KEY = "value"
fetch_instance_secret() {
  local host="$1" key="$2" label="${3:-$2}"
  local val
  val="$(sed -n "/^\[${host}\]/,/^\[/p" "$INSTANCE_SECRETS" \
    | grep "^${key}" \
    | sed "s/${key} *= *\"\(.*\)\"/\1/")"
  [[ -n "$val" ]] \
    || die "no ${label} for host '${host}' in instance-secrets.toml"
  [[ "$val" == *$'\n'* || "$val" == *$'\r'* ]] \
    && die "${label} for '${host}' contains CR/LF"
  printf '%s' "$val"
}

fetch_instance_password() { fetch_instance_secret "$1" 'POSTGRES_APP_PASSWORD'; }
fetch_instance_cloudflared_token() { fetch_instance_secret "$1" 'CLOUDFLARED_TOKEN'; }

# Create one GCP instance per rendered host from the golden image family. The
# rendered cloud-init is injected as the `user-data` metadata key (GCE cloud-init
# reads it); OS Login is disabled and an admin ssh-key is added so the box stays
# reachable for verification. Opt-in (PROVISION=1) because it is billable. The
# golden image lives in GCP_PROJECT, so --image-project == GCP_PROJECT.
provision_gcp() {
  command -v gcloud >/dev/null 2>&1 || die "PROVISION=1 but gcloud is not installed"
  gcloud compute images describe-from-family "$GCP_IMAGE_FAMILY" \
    --project "$GCP_PROJECT" >/dev/null 2>&1 \
    || die "golden image family '$GCP_IMAGE_FAMILY' not found in project $GCP_PROJECT"

  # Optional admin ssh-key metadata (so we can SSH in to verify the fleet).
  local ssh_meta=""
  if [[ -r "$GCP_SSH_PUBKEY_PATH" ]]; then
    ssh_meta="${GCP_SSH_USER}:$(tr -d '\n' < "$GCP_SSH_PUBKEY_PATH")"
  else
    warn "GCP_SSH_PUBKEY_PATH ($GCP_SSH_PUBKEY_PATH) not readable — instances will have no admin ssh-key (use 'gcloud compute ssh')."
  fi

  local host out name meta created=0 skipped=0 failed=0
  for host in "${hosts[@]}"; do
    out="$OUT_DIR/$host.cloud-init.yaml"
    [[ -f "$out" ]] || die "no rendered cloud-init for '$host' at $out"
    name="${GCP_INSTANCE_PREFIX}${host}"

    # Idempotent: if the instance already exists, skip it and keep going. Lets an
    # interrupted fleet rollout be re-run without aborting on the first box.
    if gcloud compute instances describe "$name" \
         --project "$GCP_PROJECT" --zone "$GCP_ZONE" >/dev/null 2>&1; then
      echo "clone.sh: $name already exists — skipping"
      skipped=$((skipped + 1))
      continue
    fi

    echo "clone.sh: creating GCP instance $name ($GCP_MACHINE_TYPE, $GCP_ZONE) from family $GCP_IMAGE_FAMILY"
    meta="enable-oslogin=FALSE"
    [[ -n "$ssh_meta" ]] && meta="${meta},ssh-keys=${ssh_meta}"

    # Don't let one failed create abort the rest of the fleet — log and continue.
    if gcloud compute instances create "$name" \
      --project "$GCP_PROJECT" \
      --zone "$GCP_ZONE" \
      --machine-type "$GCP_MACHINE_TYPE" \
      --image-family "$GCP_IMAGE_FAMILY" \
      --image-project "$GCP_PROJECT" \
      --boot-disk-size "$GCP_DISK_SIZE" \
      --boot-disk-type "$GCP_DISK_TYPE" \
      --metadata-from-file "user-data=$out" \
      --metadata "$meta" \
      --labels "project=goto-2026,hostname=$host"; then
      created=$((created + 1))
    else
      warn "gcloud create failed for $name — continuing with the remaining boxes"
      failed=$((failed + 1))
    fi
  done
  echo "clone.sh: provision summary — created=$created skipped=$skipped failed=$failed (family $GCP_IMAGE_FAMILY, project $GCP_PROJECT)"
  [[ "$failed" -eq 0 ]] || die "$failed instance create(s) failed (see log above)"
}

# --- arg parse ---------------------------------------------------------------
hosts=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --provision) PROVISION=1 ;;
    -h|--help) sed -n '2,/^set -euo pipefail$/p' "${BASH_SOURCE[0]}"; exit 0 ;;
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
  postgres_app_password="$(fetch_instance_password "$host")"
  cloudflared_token="$(fetch_instance_cloudflared_token "$host")"
  # Strict validation BEFORE substitution: both land in tunnel.env, sourced by
  # root on the box, so reject anything outside their known charset (this also
  # subsumes the CR/LF check). A backtick/$()/quote here would otherwise run as
  # root at first boot.
  [[ "$cloudflared_token" =~ $CLOUDFLARED_TOKEN_RE ]] \
    || die "CLOUDFLARED_TOKEN for '$host' is malformed (must match $CLOUDFLARED_TOKEN_RE)"
  [[ "$postgres_app_password" =~ $POSTGRES_APP_PASSWORD_RE ]] \
    || die "POSTGRES_APP_PASSWORD for '$host' is malformed (must match $POSTGRES_APP_PASSWORD_RE)"
  # TUNNEL_SALT is fleet-wide; CLOUDFLARED_TOKEN is now per-instance.
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
echo "clone.sh: TUNNEL_SALT fleet-wide (source=$TUNNEL_SECRETS_SOURCE); CLOUDFLARED_TOKEN per-instance from instance-secrets.toml"
echo "clone.sh: POSTGRES_APP_PASSWORD per-instance from instance-secrets.toml"

# --- optional: provision GCP instances from the golden image -----------------
if [[ "$PROVISION" == "1" ]]; then
  provision_gcp
else
  echo "clone.sh: render-only (pass --provision or PROVISION=1 to create GCP instances)"
fi
