#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(uname -s)" != "Linux" ]; then
  echo "install-tools-vps.sh only supports Linux hosts."
  exit 1
fi

VPS_MISE_FILE="${VPS_MISE_FILE:-$ROOT_DIR/mise.vps.toml}"
VPS_CARGO_TOOLS_FILE="${VPS_CARGO_TOOLS_FILE:-$ROOT_DIR/cargo-tools.vps.txt}"
INSTALL_VPS_CARGO_TOOLS="${INSTALL_VPS_CARGO_TOOLS:-1}"
STOW_DOTFILES="${STOW_DOTFILES:-1}"

install_mise_if_needed() {
  if command -v mise >/dev/null 2>&1; then
    return
  fi

  echo "Installing mise..."
  curl -fsSL https://mise.run | sh
  export PATH="$HOME/.local/bin:$PATH"
}

install_vps_mise_tools() {
  local config_file="$1"

  if [ ! -f "$config_file" ]; then
    echo "No VPS mise config at $config_file"
    return
  fi

  mise trust "$config_file" >/dev/null 2>&1 || true

  echo "Installing runtimes from $config_file..."
  MISE_CONFIG_FILE="$config_file" mise install
}

if [ "$STOW_DOTFILES" = "1" ]; then
  echo "Linking dotfiles..."
  "$ROOT_DIR/install"
fi

install_mise_if_needed
install_vps_mise_tools "$VPS_MISE_FILE"

if [ "$INSTALL_VPS_CARGO_TOOLS" = "1" ]; then
  if [ -f "$VPS_CARGO_TOOLS_FILE" ]; then
    echo "Installing VPS cargo tools..."
    "$ROOT_DIR/scripts/install-cargo-tools.sh" "$VPS_CARGO_TOOLS_FILE"
  else
    echo "No VPS cargo tools file found at $VPS_CARGO_TOOLS_FILE"
  fi
fi

echo "VPS tool setup complete."
echo "Next: run ./scripts/doctor-vps.sh"
