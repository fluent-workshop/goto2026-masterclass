#!/bin/bash
SESSION="audit-codex"
tmux new-session -d -s $SESSION -c /Users/openclaw/src/spantree/goto-2026-masterclass
tmux send-keys -t $SESSION "codex" C-m
sleep 3
# Provide the goal instruction
tmux send-keys -t $SESSION "/goal .cc-dispatch/loops/loop-018-skill-audit/prompt.md" C-m
