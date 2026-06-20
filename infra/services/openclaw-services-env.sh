#!/usr/bin/env bash
# Ensure /opt/openclaw/services/.env carries the internal Postgres<->SonarQube
# DB password. Generated ONCE on the real box at first boot (idempotent), never
# committed and never baked. Not a student secret — purely the local DB auth
# shared between the postgres and sonarqube containers.

set -euo pipefail

SERVICES_DIR="/opt/openclaw/services"
ENV_FILE="$SERVICES_DIR/.env"

if [[ -s "$ENV_FILE" ]] && grep -q '^SONAR_DB_PASSWORD=' "$ENV_FILE"; then
  exit 0
fi

install -d -m 0750 "$SERVICES_DIR"
umask 077
printf 'SONAR_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> "$ENV_FILE"
echo "openclaw-services-env: generated SONAR_DB_PASSWORD in $ENV_FILE"
