#!/usr/bin/env bash
# Block until SonarQube answers /api/system/status with "status":"UP", or fail
# after a bounded wait (M8). The services unit is Type=oneshot, so without this
# it reports "active" the instant `docker compose up -d` returns — while
# SonarQube is still 60-120s into its Elasticsearch + DB-migration boot. Labs
# that hit SonarQube right after first boot would then get connection refused.
# Run as the unit's ExecStartPost so the unit only goes active once SonarQube is
# genuinely ready (and fails loudly if it never comes up).

set -euo pipefail

# 30 x 5s = 2.5 min by default; override for slower first boots if needed.
URL="${SONAR_STATUS_URL:-http://127.0.0.1:9000/api/system/status}"
RETRIES="${SONAR_READY_RETRIES:-30}"
INTERVAL="${SONAR_READY_INTERVAL:-5}"

for ((i = 1; i <= RETRIES; i++)); do
  if curl -fsS --max-time 5 "$URL" 2>/dev/null | grep -q '"status":"UP"'; then
    echo "openclaw-sonarqube-ready: SonarQube UP after ${i} attempt(s)."
    exit 0
  fi
  sleep "$INTERVAL"
done

echo "openclaw-sonarqube-ready: SonarQube not UP after $((RETRIES * INTERVAL))s polling ${URL}." >&2
exit 1
