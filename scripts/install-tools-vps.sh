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
  MISE_OVERRIDE_CONFIG_FILENAMES="mise.vps.toml" mise install
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

set_login_shell() {
  local target_shell="${VPS_LOGIN_SHELL:-nu}"
  local shell_path

  shell_path="$(command -v "$target_shell" 2>/dev/null || true)"
  if [ -z "$shell_path" ]; then
    echo "Shell '$target_shell' not found in PATH; skipping login shell change."
    return
  fi

  local current_shell
  current_shell="$(getent passwd "$(whoami)" | cut -d: -f7)"
  if [ "$current_shell" = "$shell_path" ]; then
    echo "Login shell already set to $shell_path"
    return
  fi

  if ! grep -Fxq "$shell_path" /etc/shells 2>/dev/null; then
    echo "Adding $shell_path to /etc/shells..."
    echo "$shell_path" | sudo tee -a /etc/shells >/dev/null
  fi

  echo "Changing login shell to $shell_path..."
  sudo chsh -s "$shell_path" "$(whoami)"
  echo "Login shell set to $shell_path (effective on next login)."
}

set_login_shell

echo "VPS tool setup complete."
echo "Next: run ./scripts/doctor-vps.sh"
