#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS_NAME="$(uname -s)"

ensure_brew_in_path() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi

  local brew_bin
  for brew_bin in /opt/homebrew/bin/brew /home/linuxbrew/.linuxbrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$brew_bin" ]; then
      eval "$("$brew_bin" shellenv)"
      return 0
    fi
  done

  return 1
}

if ! ensure_brew_in_path; then
  echo "Homebrew not found. Installing Homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ensure_brew_in_path
fi

echo "Installing Homebrew packages from Brewfile..."
brew bundle --file "$ROOT_DIR/Brewfile"

if [ "$OS_NAME" = "Darwin" ] && [ -f "$ROOT_DIR/Brewfile.macos" ]; then
  echo "Installing macOS-only Homebrew packages..."
  brew bundle --file "$ROOT_DIR/Brewfile.macos"
fi

if ! command -v mise >/dev/null 2>&1; then
  echo "Installing mise..."
  brew install mise
fi

if [ -f "$ROOT_DIR/mise.toml" ]; then
  echo "Installing runtimes from mise.toml..."
  mise trust "$ROOT_DIR/mise.toml" >/dev/null 2>&1 || true
  mise install -C "$ROOT_DIR"
fi

if [ -f "$ROOT_DIR/cargo-tools.txt" ]; then
  echo "Installing cargo tools from cargo-tools.txt..."
  "$ROOT_DIR/scripts/install-cargo-tools.sh" "$ROOT_DIR/cargo-tools.txt"
fi

echo "Done. Tool bootstrap complete."
