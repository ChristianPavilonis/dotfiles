#!/usr/bin/env bash
# Helper for zellij sessionizer fzf bindings (delete/kill sessions)
ACTION="$1"
DISPLAY_LINE="$2"
CLEAN_PATH=$(echo "$DISPLAY_LINE" | sed 's/\x1b\[[0-9;]*m//g' | sed 's/ ([^)]*)$//')
if [[ "$CLEAN_PATH" == ~* ]]; then
    FULL_PATH="$HOME${CLEAN_PATH:1}"
else
    FULL_PATH="$CLEAN_PATH"
fi
SESSION_NAME=$(basename "$FULL_PATH")
if [[ "$ACTION" == "delete" ]]; then
    zellij delete-session "$SESSION_NAME" --force 2>/dev/null
elif [[ "$ACTION" == "kill" ]]; then
    zellij kill-session "$SESSION_NAME" 2>/dev/null
fi
