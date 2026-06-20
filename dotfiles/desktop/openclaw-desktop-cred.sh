#!/usr/bin/env bash
# Materialize the nginx basic-auth htpasswd for the classroom desktop from the
# per-instance credential that cloud-init drops at clone time.
#
# Runs at FIRST BOOT (openclaw-desktop-cred.service), NOT during the bake — the
# golden snapshot must contain no student secret. cloud-init writes
# /etc/openclaw/desktop.env (DESKTOP_USER / DESKTOP_PASS) per instances.txt row;
# until that file exists the htpasswd is absent and nginx fails closed (401/403).

set -euo pipefail

ENV_FILE="/etc/openclaw/desktop.env"
HTPASSWD="/etc/nginx/.htpasswd"

if [[ ! -r "$ENV_FILE" ]]; then
  # Steady state after first boot: the env file was consumed and deleted (m2),
  # while the htpasswd it produced persists — nginx keeps working, do nothing.
  if [[ -f "$HTPASSWD" ]]; then
    echo "openclaw-desktop-cred: $ENV_FILE absent, $HTPASSWD present — credential already provisioned."
    exit 0
  fi
  echo "openclaw-desktop-cred: $ENV_FILE absent — leaving htpasswd unset; nginx fails closed." >&2
  exit 0
fi

set -a
# shellcheck source=/dev/null  # runtime file written by cloud-init, not at lint time
. "$ENV_FILE"
set +a

if [[ -z "${DESKTOP_USER:-}" || -z "${DESKTOP_PASS:-}" ]]; then
  echo "openclaw-desktop-cred: DESKTOP_USER/DESKTOP_PASS missing in $ENV_FILE." >&2
  exit 1
fi

# -B (bcrypt) so the on-disk hash isn't a weak crypt(); -c creates the file.
htpasswd -bBc "$HTPASSWD" "$DESKTOP_USER" "$DESKTOP_PASS"
chgrp www-data "$HTPASSWD" 2>/dev/null || true
chmod 0640 "$HTPASSWD"
echo "openclaw-desktop-cred: wrote $HTPASSWD for user '$DESKTOP_USER'."

# The plaintext password has now been consumed into the bcrypt htpasswd; remove
# the cleartext credential so it does not persist on the box (m2). Subsequent
# boots hit the "already provisioned" branch above and leave the htpasswd intact.
rm -f "$ENV_FILE"
echo "openclaw-desktop-cred: removed $ENV_FILE (plaintext credential consumed)."
