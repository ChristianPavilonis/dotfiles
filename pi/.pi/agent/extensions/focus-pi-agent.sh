#!/usr/bin/env bash
# Focus the Kitty window and Zellij pane that owned a Pi completion notification.
# Arguments are passed by Omarchy's argv-preserving notification action:
#   <zellij-session> <zellij-pane> <hyprland-window-address>

set -u

TARGET_SESSION=${1:-}
TARGET_PANE=${2:-}
TARGET_WINDOW=${3:-}
ZELLIJ_BIN=${ZELLIJ_BIN:-zellij}
SWITCH_PLUGIN_URL="https://github.com/mostafaqanbaryan/zellij-switch/releases/download/0.2.1/zellij-switch.wasm"
SWITCH_PLUGIN="file:${HOME}/.config/zellij/plugins/zellij-switch.wasm"

if command -v hyprctl >/dev/null 2>&1 && [[ -n "$TARGET_WINDOW" && "$TARGET_WINDOW" =~ ^0x[0-9a-fA-F]+$ ]]; then
    hyprctl dispatch focuswindow "address:${TARGET_WINDOW}" >/dev/null 2>&1 || true
fi

# A non-Zellij Pi session can still use the Kitty focus part of this action.
if [[ -z "$TARGET_SESSION" || -z "$TARGET_PANE" ]]; then
    exit 0
fi

has_clients() {
    local session=$1
    local clients
    clients=$($ZELLIJ_BIN --session "$session" action list-clients 2>/dev/null || true)
    awk '$1 ~ /^[0-9]+$/ && $2 ~ /^(terminal|plugin)_[0-9]+$/ { found = 1 } END { exit found ? 0 : 1 }' <<<"$clients"
}

# Focus the pane in the target session before switching to it. This also
# selects the target tab because pane IDs are unique within a Zellij session.
$ZELLIJ_BIN --session "$TARGET_SESSION" action focus-pane-id "$TARGET_PANE" >/dev/null 2>&1 || true

# If the target session is attached to a Kitty client already, focusing its
# saved Hyprland window is enough. Otherwise, find the attached client and use
# the same session-switch plugin used by the local Zellij configuration.
if has_clients "$TARGET_SESSION"; then
    exit 0
fi

if [[ -f "${HOME}/.config/zellij/plugins/zellij-switch.wasm" ]]; then
    SWITCH_PLUGIN="file:${HOME}/.config/zellij/plugins/zellij-switch.wasm"
fi

CURRENT_SESSION=""
while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    if has_clients "$candidate"; then
        CURRENT_SESSION=$candidate
        break
    fi
done < <($ZELLIJ_BIN list-sessions --short 2>/dev/null || true)

if [[ -n "$CURRENT_SESSION" && "$CURRENT_SESSION" != "$TARGET_SESSION" ]]; then
    $ZELLIJ_BIN --session "$CURRENT_SESSION" pipe \
        --plugin "$SWITCH_PLUGIN" -- "--session ${TARGET_SESSION}" >/dev/null 2>&1 || \
        $ZELLIJ_BIN --session "$CURRENT_SESSION" pipe \
            --plugin "$SWITCH_PLUGIN_URL" -- "--session ${TARGET_SESSION}" >/dev/null 2>&1 || true
    $ZELLIJ_BIN --session "$TARGET_SESSION" action focus-pane-id "$TARGET_PANE" >/dev/null 2>&1 || true
fi
