#!/usr/bin/env bash
set -euo pipefail

VAULT_DIR="${OBSIDIAN_VAULT_DIR:-$HOME/Documents/MyObsidianVault}"
OB_CMD="${OBSIDIAN_OB_CMD:-$HOME/.bun/bin/ob}"

cd "$VAULT_DIR"

while true; do
  synced=0

  for attempt in 1 2 3 4 5; do
    rm -rf ".obsidian/.sync.lock"

    if "$OB_CMD" sync --path "$VAULT_DIR"; then
      synced=1
      break
    fi

    sleep 0.3
  done

  if [ "$synced" -eq 1 ]; then
    sleep 20
  else
    sleep 10
  fi
done
