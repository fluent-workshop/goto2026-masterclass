#!/usr/bin/env bash
# Per-box first-boot setup for the student VPS. Currently seeds a DEFAULT git
# identity for the `ubuntu` user, DERIVED FROM THE HOSTNAME, so commits made in
# class are attributable to the box (e.g. "Pikachu") even before a student
# enrolls.
#
# Runs at FIRST BOOT (openclaw-firstboot.service, ordered After=network-online.target
# — cloud-init applies the hostname in an earlier stage, so it is already set by
# the time this runs), NOT during the bake — the golden image is generic and
# carries no per-box identity.
#
# This is a per-box DEFAULT, set on the student box (a single-purpose, ephemeral
# VPS) — NOT on the build machine. The /enroll flow later OVERRIDES user.name +
# user.email with the student's real name/email; we set these ONLY when unset, so
# an enrolled identity is never clobbered and survives reboots.

set -euo pipefail

AGENT_USER="ubuntu"
AGENT_HOME="/home/$AGENT_USER"

# Short hostname (pikachu) — the per-box identifier cloud-init set this boot.
host="$(hostname -s)"

# git config --global AS the ubuntu user → writes /home/ubuntu/.gitconfig.
git_cfg() {
  sudo -u "$AGENT_USER" env HOME="$AGENT_HOME" git config --global "$@"
}

# Title-case the hostname for the display name (pikachu -> Pikachu).
name="${host^}"
email="${host}-goto2026@fluentworkshop.dev"

# Idempotent + enrollment-safe: only seed each field when it is not already set
# (a `git config --get` of an unset key exits non-zero), so re-running on a later
# boot — or after /enroll has written the student's real identity — leaves the
# existing value untouched.
if [[ -z "$(git_cfg user.name || true)" ]]; then
  git_cfg user.name "$name"
  echo "openclaw-firstboot: seeded git user.name='$name' for $AGENT_USER (hostname default)."
else
  echo "openclaw-firstboot: git user.name already set for $AGENT_USER — leaving it."
fi

if [[ -z "$(git_cfg user.email || true)" ]]; then
  git_cfg user.email "$email"
  echo "openclaw-firstboot: seeded git user.email='$email' for $AGENT_USER (hostname default)."
else
  echo "openclaw-firstboot: git user.email already set for $AGENT_USER — leaving it."
fi
