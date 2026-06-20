#!/usr/bin/env bash
# infra/clone.sh — render the per-instance cloud-init for the GOTO 2026 lab.
#
# For each host (instances.txt by default, or hostnames passed as args) this
# substitutes ALL placeholders in infra/cloud-init/template.yaml:
#     {{HOSTNAME}} {{OPENCLAW_API_KEY}} {{DESKTOP_USER}} {{DESKTOP_PASS}}
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
#   OPENCLAW_API_KEY        used when OPENCLAW_API_KEY_SOURCE=env
#   OP_API_KEY_ITEM         used when OPENCLAW_API_KEY_SOURCE=op (op:// ref)

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
FORCE=0

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

# Reuse a previously-issued desktop password for a host (idempotency), else "".
existing_password() {
  local host="$1"
  [[ -f "$MANIFEST" ]] || { printf ''; return; }
  # manifest columns: hostname \t desktop_user \t desktop_pass \t api_key_source
  awk -F'\t' -v h="$host" '$1==h {print $3; exit}' "$MANIFEST"
}

# --- arg parse ---------------------------------------------------------------
hosts=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
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

  rendered="${template//\{\{HOSTNAME\}\}/$host}"
  rendered="${rendered//\{\{OPENCLAW_API_KEY\}\}/$api_key}"
  rendered="${rendered//\{\{DESKTOP_USER\}\}/$DESKTOP_USER}"
  rendered="${rendered//\{\{DESKTOP_PASS\}\}/$pass}"

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
