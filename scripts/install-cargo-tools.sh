#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_FILE="${1:-$ROOT_DIR/cargo-tools.txt}"

if [ ! -f "$TOOLS_FILE" ]; then
  echo "No cargo tools file found at: $TOOLS_FILE"
  exit 0
fi

use_mise_cargo=0
if ! command -v cargo >/dev/null 2>&1; then
  if command -v mise >/dev/null 2>&1 && [ -f "$ROOT_DIR/mise.toml" ]; then
    use_mise_cargo=1
    mise trust "$ROOT_DIR/mise.toml" >/dev/null 2>&1 || true
  else
    echo "cargo not found and mise fallback unavailable. Skipping cargo tools."
    exit 0
  fi
fi

run_cargo() {
  if [ "$use_mise_cargo" -eq 1 ]; then
    mise exec -C "$ROOT_DIR" -- cargo "$@"
  else
    cargo "$@"
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

if ! command -v cargo-binstall >/dev/null 2>&1; then
  echo "Installing cargo-binstall..."
  run_cargo install --locked cargo-binstall
fi

supports_binstall=0
if [ "$use_mise_cargo" -eq 0 ] && command -v cargo-binstall >/dev/null 2>&1; then
  supports_binstall=1
fi

failed_crates=()

install_crate() {
  local crate="$1"

  if [ "$supports_binstall" -eq 1 ]; then
    echo "Installing $crate via cargo-binstall..."
    if ! cargo binstall --no-confirm "$crate"; then
      echo "Falling back to cargo install for $crate..."
      if ! run_cargo install --locked "$crate"; then
        return 1
      fi
    fi
  else
    echo "Installing $crate via cargo install..."
    if ! run_cargo install --locked "$crate"; then
      return 1
    fi
  fi

  return 0
}

while IFS= read -r raw_line || [ -n "$raw_line" ]; do
  line="${raw_line%%#*}"
  crate="$(trim "$line")"

  if [ -z "$crate" ]; then
    continue
  fi

  if ! install_crate "$crate"; then
    echo "Failed to install $crate"
    failed_crates+=("$crate")
  fi
done < "$TOOLS_FILE"

if [ "${#failed_crates[@]}" -gt 0 ]; then
  echo "Cargo tool installation finished with failures: ${failed_crates[*]}"
  exit 1
fi

echo "Cargo tool installation complete."
