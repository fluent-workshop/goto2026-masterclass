#!/usr/bin/env bash
# infra/clone.sh — render the per-instance cloud-init for the GOTO 2026 lab.
#
# For each host (instances.toml roster by default, or hostnames passed as args)
# this substitutes ALL placeholders in infra/cloud-init/template.yaml:
#     {{HOSTNAME}} {{ANTHROPIC_API_KEY_B64}} {{DESKTOP_USER}} {{DESKTOP_PASS}}
#     {{TUNNEL_SALT}} {{CLOUDFLARED_TOKEN}} {{POSTGRES_APP_PASSWORD}}
#     {{ELEVENLABS_VOICE_ID}} (per-box) and the fleet-wide student keys
#     {{OPENAI_API_KEY}} {{ELEVENLABS_API_KEY}} {{EXA_API_KEY}}
#     {{FIRECRAWL_API_KEY}} {{CODERABBIT_API_KEY}} {{VSCODE_TUNNEL_GITHUB_TOKEN}}
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
# Anthropic API key: read PER-BOX from instance-secrets.toml (like CLOUDFLARED_TOKEN),
# b64-encoded into /home/ubuntu/.openclaw/credentials/api-key. Each box gets its
# own key for billing isolation. When a box's section has no ANTHROPIC_API_KEY and
# ALLOW_STUB=1, a clearly-fake placeholder is rendered (dev/test only).
#
# Fleet-wide student keys (OPENAI_API_KEY, ELEVENLABS_API_KEY, EXA_API_KEY,
# FIRECRAWL_API_KEY, CODERABBIT_API_KEY, VSCODE_TUNNEL_GITHUB_TOKEN) come from the
# ENVIRONMENT (e.g. .envrc.local), same as TUNNEL_SALT — one shared value across the
# fleet, read once. ALLOW_STUB=1 substitutes obvious placeholders for any unset one.
#
# TUNNEL_SALT is FLEET-WIDE (the same value on every box; it only salts the
# per-box hostname hash). CLOUDFLARED_TOKEN, POSTGRES_APP_PASSWORD and
# ANTHROPIC_API_KEY are PER-INSTANCE, read from instance-secrets.toml (a gitignored
# file at repo root) keyed by hostname. ELEVENLABS_VOICE_ID is per-box too but
# NON-sensitive, so it lives in instances.toml (git-tracked). Per-instance secrets
# are validated against a strict charset before they are written into a cloud-init
# .env that is later sourced by root on the box.
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
#   infra/clone.sh                 # render every host in instances.toml
#   infra/clone.sh pikachu gengar  # render only these (handy for a test host)
#   infra/clone.sh --force         # rotate every desktop password
#   infra/clone.sh pikachu --provision   # render + create the GCP instance(s)
#
# Env:
#   DESKTOP_USER            override the desktop username (default: student)
#   ALLOW_STUB              set to 1 to permit stub values (dev/test only); gates
#                           the per-box Anthropic key, the tunnel-secrets stub, and
#                           any unset fleet-wide student key
#   TUNNEL_SECRETS_SOURCE   stub (default) | env | op  (governs ONLY the
#                           fleet-wide TUNNEL_SALT below)
#   TUNNEL_SALT             used when TUNNEL_SECRETS_SOURCE=env (alphanumeric)
#   OP_TUNNEL_SALT_ITEM     used when TUNNEL_SECRETS_SOURCE=op (op:// ref)
#   OPENAI_API_KEY          fleet-wide student key (from env, e.g. .envrc.local)
#   ELEVENLABS_API_KEY      fleet-wide student key (from env)
#   EXA_API_KEY             fleet-wide student key (from env)
#   FIRECRAWL_API_KEY       fleet-wide student key (from env)
#   CODERABBIT_API_KEY      fleet-wide student key (from env)
#   VSCODE_TUNNEL_GITHUB_TOKEN  fleet-wide GitHub PAT for VS Code tunnel pre-auth
#   (CLOUDFLARED_TOKEN, POSTGRES_APP_PASSWORD and ANTHROPIC_API_KEY are
#    PER-INSTANCE, read from instance-secrets.toml — NOT from TUNNEL_SECRETS_SOURCE;
#    ELEVENLABS_VOICE_ID is per-box from instances.toml)
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
#
# Three keys are always injected (all trusted admin + instructor access):
#   1. Cedric's MacBook:       ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAII8l7J7IvLdLrwVXwJZzeBOUqF0KqKjFlNVC6jwD2CP1
#   2. OpenClaw account (Mac mini): ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHlfPHnFAoDVrHaWZ6bEwGJRNvB8gVeJGYbiBh7peVgV
#   3. Pikachu instructor key: infra/keys/pikachu-instructor.pub

set -euo pipefail

# --- paths -------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SCRIPT_DIR/cloud-init/template.yaml"
INSTANCES="$REPO_ROOT/instances.toml"
OUT_DIR="$SCRIPT_DIR/cloud-init/generated"
MANIFEST="$OUT_DIR/credentials-manifest.tsv"

# --- config ------------------------------------------------------------------
DESKTOP_USER="${DESKTOP_USER:-student}"
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
# Secret validation and TOML parsing are handled by the Bun scripts in
# infra/scripts/ (validate-secrets.ts, toml-get.ts). The regex constants
# that used to live here have moved there.

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

# Read a fleet-wide student key from the environment (e.g. .envrc.local), the same
# pattern as TUNNEL_SALT: one shared value across all 14 boxes, read ONCE. If the
# env var is unset, emit an obvious placeholder when ALLOW_STUB=1 (dev/test) or die
# loudly otherwise — a fleet render that forgot a real key must never silently ship.
# Args: human label, env var NAME (read indirectly), stub placeholder.
fetch_fleet_secret() {
  local label="$1" env_var="$2" stub="$3"
  if [[ -n "${!env_var:-}" ]]; then
    printf '%s' "${!env_var}"
  elif [[ "$ALLOW_STUB" == "1" ]]; then
    printf '%s' "$stub"
  else
    die "fleet-wide key $env_var ($label) is unset. Export it (e.g. in .envrc.local) or set ALLOW_STUB=1 for dev/test only."
  fi
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
# Fail-fast gate for the tunnel-secrets stub: a stub salt/token renders a
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

# Read the fleet-wide student keys ONCE (same value on every box). These come from
# the environment (.envrc.local), validated for presence here; an unset one is a
# hard error unless ALLOW_STUB=1 (which substitutes the obvious placeholder below).
openai_api_key="$(fetch_fleet_secret 'OPENAI_API_KEY' OPENAI_API_KEY 'REPLACE_ME__openai_api_key')"
elevenlabs_api_key="$(fetch_fleet_secret 'ELEVENLABS_API_KEY' ELEVENLABS_API_KEY 'REPLACE_ME__elevenlabs_api_key')"
exa_api_key="$(fetch_fleet_secret 'EXA_API_KEY' EXA_API_KEY 'REPLACE_ME__exa_api_key')"
firecrawl_api_key="$(fetch_fleet_secret 'FIRECRAWL_API_KEY' FIRECRAWL_API_KEY 'REPLACE_ME__firecrawl_api_key')"
coderabbit_api_key="$(fetch_fleet_secret 'CODERABBIT_API_KEY' CODERABBIT_API_KEY 'REPLACE_ME__coderabbit_api_key')"
# VSCODE_TUNNEL_GITHUB_TOKEN is fleet-wide too but firstboot-only (consumed by the
# runcmd `code tunnel user login`); it is NOT exposed in student-keys.env.
vscode_tunnel_github_token="$(fetch_fleet_secret 'VSCODE_TUNNEL_GITHUB_TOKEN' VSCODE_TUNNEL_GITHUB_TOKEN 'REPLACE_ME__vscode_tunnel_github_token')"

# Reject CR/LF in any fleet key up front (defense in depth): they flow into a
# sourced .env (student-keys.env) and a runcmd line, so an embedded newline is
# almost always a copy-paste artifact and must fail loudly, not corrupt the YAML.
for _fk in "$openai_api_key" "$elevenlabs_api_key" "$exa_api_key" \
           "$firecrawl_api_key" "$coderabbit_api_key" "$vscode_tunnel_github_token"; do
  [[ "$_fk" == *$'\n'* || "$_fk" == *$'\r'* ]] \
    && die "a fleet-wide student key contains CR/LF; refusing to render"
done

INSTANCE_SECRETS="$REPO_ROOT/instance-secrets.toml"
[[ -f "$INSTANCE_SECRETS" ]] \
  || die "instance-secrets.toml not found at $INSTANCE_SECRETS"
INSTANCES_ROSTER="$REPO_ROOT/instances.toml"
[[ -f "$INSTANCES_ROSTER" ]] \
  || die "instances.toml not found at $INSTANCES_ROSTER"

# Parse a per-instance value from instance-secrets.toml.
# Sections look like: [pikachu] / KEY = "value"
# fetch_instance_secret / fetch_instance_password / fetch_instance_cloudflared_token
# replaced by `bun run infra/scripts/toml-get.ts` in the render loop below.
# The fragile sed/grep TOML parser is gone; toml-get handles quoting, whitespace,
# and missing sections with clear error messages.

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
  # Build multi-key ssh-keys metadata. GCP format: one "user:pubkey" per line.
  # We always inject three keys: Cedric's MacBook, the OpenClaw account on the
  # Mac mini, and the pikachu instructor key (so pikachu can SSH all students).
  local CEDRIC_MACBOOK_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAII8l7J7IvLdLrwVXwJZzeBOUqF0KqKjFlNVC6jwD2CP1 cedric-macbook"
  local OPENCLAW_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHlfPHnFAoDVrHaWZ6bEwGJRNvB8gVeJGYbiBh7peVgV openclaw-mac-mini"
  local PIKACHU_PUBKEY_PATH="$REPO_ROOT/infra/keys/pikachu-instructor.pub"
  local PIKACHU_KEY=""
  [[ -r "$PIKACHU_PUBKEY_PATH" ]] && PIKACHU_KEY="$(tr -d '\n' < "$PIKACHU_PUBKEY_PATH")"

  local ssh_meta=""
  local key_lines=()
  # Extra key from env/path (backwards compat)
  if [[ -r "$GCP_SSH_PUBKEY_PATH" ]]; then
    key_lines+=("${GCP_SSH_USER}:$(tr -d '\n' < "$GCP_SSH_PUBKEY_PATH")")
  fi
  key_lines+=("${GCP_SSH_USER}:${CEDRIC_MACBOOK_KEY}")
  key_lines+=("${GCP_SSH_USER}:${OPENCLAW_KEY}")
  [[ -n "$PIKACHU_KEY" ]] && key_lines+=("${GCP_SSH_USER}:${PIKACHU_KEY}")
  # Join with literal \n (GCP metadata accepts newline-separated key lines)
  ssh_meta="$(printf '%s\n' "${key_lines[@]}")"

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

# Default host list = the section names in instances.toml (the canonical roster).
# toml-get --sections emits a JSON array of hostnames; jq splits it to lines.
if [[ ${#hosts[@]} -eq 0 ]]; then
  [[ -f "$INSTANCES" ]] || die "instances.toml not found: $INSTANCES"
  while IFS= read -r line; do
    [[ -n "$line" ]] && hosts+=("$line")
  done < <(bun run --silent "$SCRIPT_DIR/scripts/toml-get.ts" "$INSTANCES" --sections \
             | jq -r '.[]')
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
  # Desktop password: instance-secrets.toml is the canonical source (so every
  # box's creds live in one auditable place). Fall back to the old manifest for
  # backward compat, then auto-generate if truly absent. --force skips both and
  # rotates to a fresh password (also rewrites instance-secrets.toml via a note
  # in the manifest — manual update still required for the TOML).
  pass=""
  if [[ "$FORCE" -eq 0 ]]; then
    # 1. Check instance-secrets.toml first (canonical)
    pass="$(bun run --silent "$SCRIPT_DIR/scripts/toml-get.ts" \
      "$REPO_ROOT/instance-secrets.toml" "$host" DESKTOP_PASS 2>/dev/null || true)"
    # 2. Fall back to legacy credentials-manifest.tsv
    if [[ -z "$pass" ]]; then
      pass="$(existing_password "$host")"
    fi
  fi
  if [[ -z "$pass" ]]; then
    pass="$(gen_password)"
    warn "$host: DESKTOP_PASS not in instance-secrets.toml — generated new password. Add to [${host}] section: DESKTOP_PASS = \"${pass}\""
  fi

  # --- Bun helpers: TOML extraction + secret validation + template rendering ---
  # toml-get reads instance-secrets.toml / instances.toml properly (no fragile
  # sed/grep parser). validate-secrets checks token shape and shell-safety before
  # anything hits the cloud-init template. render-template substitutes all
  # {{PLACEHOLDERS}} safely (split/join — no regex special-char hazards in the
  # replacement values). All three live in infra/scripts/ and speak JSON/text.

  # Per-box ANTHROPIC_API_KEY from instance-secrets.toml (like CLOUDFLARED_TOKEN).
  # toml-get exits non-zero if the section lacks the key; under ALLOW_STUB=1 that
  # becomes an obvious placeholder (dev/test), otherwise it's a hard error — every
  # real box must carry its own key for billing isolation.
  if anthropic_api_key="$(bun run --silent "$SCRIPT_DIR/scripts/toml-get.ts" \
       "$REPO_ROOT/instance-secrets.toml" "$host" ANTHROPIC_API_KEY 2>/dev/null)"; then
    anthropic_key_source="instance-secrets.toml"
  elif [[ "$ALLOW_STUB" == "1" ]]; then
    anthropic_api_key="REPLACE_ME__anthropic_api_key_for_${host}"
    anthropic_key_source="stub"
  else
    die "ANTHROPIC_API_KEY for '$host' not found in instance-secrets.toml. Add it to the [$host] section or set ALLOW_STUB=1 for dev/test only."
  fi
  # Reject CR/LF in the key up front (M3): defense in depth even though the key
  # is base64-encoded below — a newline in the source key is almost always a
  # copy-paste artifact, and failing loudly beats silently encoding a bad key.
  [[ "$anthropic_api_key" == *$'\n'* || "$anthropic_api_key" == *$'\r'* ]] \
    && die "Anthropic API key for '$host' contains CR/LF; refusing to render"
  # Encode as a single base64 line so it lands in the cloud-init write_files
  # block (encoding: b64) as one safe scalar regardless of the key's bytes.
  anthropic_api_key_b64="$(printf '%s' "$anthropic_api_key" | base64 | tr -d '\n')"

  # Extract per-instance secrets via toml-get (fails loudly if section/key missing)
  cloudflared_token="$(bun run --silent "$SCRIPT_DIR/scripts/toml-get.ts" \
    "$REPO_ROOT/instance-secrets.toml" "$host" CLOUDFLARED_TOKEN)"
  postgres_app_password="$(bun run --silent "$SCRIPT_DIR/scripts/toml-get.ts" \
    "$REPO_ROOT/instance-secrets.toml" "$host" POSTGRES_APP_PASSWORD)"

  # Per-box ElevenLabs voice ID — NON-sensitive, from the git-tracked roster.
  elevenlabs_voice_id="$(bun run --silent "$SCRIPT_DIR/scripts/toml-get.ts" \
    "$INSTANCES_ROSTER" "$host" elevenlabs_voice_id)"

  # Validate secrets before they touch the template (exit 1 on any failure).
  # Now also validates ANTHROPIC_API_KEY shape when present in the section.
  bun run --silent "$SCRIPT_DIR/scripts/validate-secrets.ts" \
    "$REPO_ROOT/instance-secrets.toml" "$host" "$tunnel_salt" \
    || die "secret validation failed for '$host' — see above"

  # Render template via Bun (safe string substitution, errors on unresolved placeholders)
  out="$OUT_DIR/$host.cloud-init.yaml"
  data="$(jq -n \
    --arg hn  "$host" \
    --arg ak  "$anthropic_api_key_b64" \
    --arg du  "$DESKTOP_USER" \
    --arg dp  "$pass" \
    --arg ts  "$tunnel_salt" \
    --arg ct  "$cloudflared_token" \
    --arg pp  "$postgres_app_password" \
    --arg vi  "$elevenlabs_voice_id" \
    --arg oa  "$openai_api_key" \
    --arg ea  "$elevenlabs_api_key" \
    --arg xa  "$exa_api_key" \
    --arg fa  "$firecrawl_api_key" \
    --arg ca  "$coderabbit_api_key" \
    --arg vt  "$vscode_tunnel_github_token" \
    '{HOSTNAME:$hn,ANTHROPIC_API_KEY_B64:$ak,DESKTOP_USER:$du,DESKTOP_PASS:$dp,
      TUNNEL_SALT:$ts,CLOUDFLARED_TOKEN:$ct,POSTGRES_APP_PASSWORD:$pp,
      ELEVENLABS_VOICE_ID:$vi,OPENAI_API_KEY:$oa,ELEVENLABS_API_KEY:$ea,
      EXA_API_KEY:$xa,FIRECRAWL_API_KEY:$fa,CODERABBIT_API_KEY:$ca,
      VSCODE_TUNNEL_GITHUB_TOKEN:$vt}')"
  bun run --silent "$SCRIPT_DIR/scripts/render-template.ts" \
    "$TEMPLATE" --data "$data" > "$out" \
    || die "template rendering failed for '$host'"
  chmod 0600 "$out"

  printf '%s\t%s\t%s\t%s\n' \
    "$host" "$DESKTOP_USER" "$pass" "$anthropic_key_source" >> "$tmp_manifest"

  echo "rendered $out (user=$DESKTOP_USER, anthropic_key_source=$anthropic_key_source)"
done

mv "$tmp_manifest" "$MANIFEST"
trap - EXIT
chmod 0600 "$MANIFEST"

echo "clone.sh: ${#hosts[@]} host(s) rendered to $OUT_DIR"
echo "clone.sh: credential manifest at $MANIFEST (SECRET — gitignored)"
echo "clone.sh: TUNNEL_SALT fleet-wide (source=$TUNNEL_SECRETS_SOURCE); CLOUDFLARED_TOKEN per-instance from instance-secrets.toml"
echo "clone.sh: POSTGRES_APP_PASSWORD + ANTHROPIC_API_KEY per-instance from instance-secrets.toml"
echo "clone.sh: ELEVENLABS_VOICE_ID per-instance from instances.toml; fleet student keys from env"

# --- optional: provision GCP instances from the golden image -----------------
if [[ "$PROVISION" == "1" ]]; then
  provision_gcp
else
  echo "clone.sh: render-only (pass --provision or PROVISION=1 to create GCP instances)"
fi
