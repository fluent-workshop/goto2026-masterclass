#!/usr/bin/env bash
# cc-dispatch hook notifier
# Fires on Stop, StopFailure, Notification, PostCompact events.
# Python parses YAML and emits pipe-delimited fields; bash calls openclaw directly.
set -euo pipefail

EVENT="Stop"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --event) EVENT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

MANIFEST=".cc-dispatch/manifest.json"
SESSIONS=".cc-dispatch/sessions.json"
[[ -f "$MANIFEST" ]] || exit 0

# Resolve session name from sessions.json (best-effort; fall back to CC env var)
SESSION_NAME="${CLAUDE_SESSION_ID:-unknown}"
if [[ -f "$SESSIONS" ]]; then
  ACTIVE_NAME=$(python3 -c "
import json
with open('$SESSIONS') as f:
    d = json.load(f)
for s in d.get('sessions', []):
    if s.get('status') == 'running':
        print(s.get('name', ''))
        break
" 2>/dev/null || true)
  [[ -n "$ACTIVE_NAME" ]] && SESSION_NAME="$ACTIVE_NAME"
fi

# Build message for event type
case "$EVENT" in
  Stop)         MSG="[CC: $SESSION_NAME] Session complete" ;;
  StopFailure)  MSG="[CC: $SESSION_NAME] Session failed - check the tmux pane" ;;
  Notification) MSG="[CC: $SESSION_NAME] Needs attention" ;;
  PostCompact)  MSG="[CC: $SESSION_NAME] Compaction done - ready for next prompt" ;;
  *)            MSG="[CC: $SESSION_NAME] $EVENT" ;;
esac

# Parse manifest.yml with Python (read-only; no subprocess calls in Python).
# Outputs one "channel|to|accountId" line per notify entry for the bash loop.
while IFS='|' read -r CHANNEL TO ACCOUNT_ID; do
  [[ -z "$CHANNEL" ]] && continue
  ARGS=(openclaw message send
        --channel "$CHANNEL"
        --to "$TO"
        --message "$MSG")
  [[ -n "$ACCOUNT_ID" ]] && ARGS+=(--account "$ACCOUNT_ID")
  "${ARGS[@]}" 2>/dev/null || true
done < <(python3 -c "
import json
with open('.cc-dispatch/manifest.json') as f:
    m = json.load(f)
for e in m.get('notify', []):
    print(e.get('channel','') + '|' + e.get('to','') + '|' + (e.get('accountId') or ''))
")
