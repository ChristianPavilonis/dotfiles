#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS_NAME="$(uname -s)"

failures=0

pass() {
  echo "[ok] $1"
}

fail() {
  echo "[fail] $1"
  failures=$((failures + 1))
}

check_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "$cmd in PATH"
  else
    fail "$cmd missing from PATH"
  fi
}

check_brewfile() {
  local brewfile="$1"
  if [ -f "$brewfile" ]; then
    if brew bundle check --file "$brewfile" --no-upgrade >/dev/null 2>&1; then
      pass "$(basename "$brewfile") satisfied"
    else
      fail "$(basename "$brewfile") has missing dependencies"
    fi
  fi
}

check_mise_exec() {
  local label="$1"
  shift

  if mise exec -C "$ROOT_DIR" -- "$@" >/dev/null 2>&1; then
    pass "$label available via mise"
  else
    fail "$label missing via mise"
  fi
}

echo "Running dotfiles doctor for $OS_NAME"

check_cmd brew
check_cmd stow
check_cmd git
check_cmd mise

if command -v brew >/dev/null 2>&1; then
  check_brewfile "$ROOT_DIR/Brewfile"
  if [ "$OS_NAME" = "Darwin" ]; then
    check_brewfile "$ROOT_DIR/Brewfile.macos"
  elif [ "$OS_NAME" = "Linux" ]; then
    check_brewfile "$ROOT_DIR/Brewfile.linux"
  fi
fi

if command -v mise >/dev/null 2>&1; then
  if [ -f "$ROOT_DIR/mise.toml" ]; then
    mise trust "$ROOT_DIR/mise.toml" >/dev/null 2>&1 || true
  fi

  check_mise_exec "node" node -v
  check_mise_exec "java" java -version
  check_mise_exec "ruby" ruby -v
  check_mise_exec "gradle" gradle -v
  check_mise_exec "bun" bun -v
  check_mise_exec "python" python --version
  check_mise_exec "rustc" rustc -V
  check_mise_exec "cargo" cargo -V
fi

if command -v nu >/dev/null 2>&1; then
  if nu -c 'version' >/dev/null 2>&1; then
    pass "nushell starts"
  else
    fail "nushell failed to start"
  fi
fi

if [ ! -f "$HOME/.cache/starship/init.nu" ]; then
  fail "missing starship init at ~/.cache/starship/init.nu"
else
  pass "starship init file exists"
fi

if [ ! -f "$HOME/.config/nushell/local.nu" ]; then
  fail "missing local Nushell overrides file at ~/.config/nushell/local.nu"
else
  pass "local Nushell overrides file exists"
fi

if [ ! -f "$HOME/.config/nushell/secrets.nu" ]; then
  fail "missing local Nushell secrets file at ~/.config/nushell/secrets.nu"
else
  pass "local Nushell secrets file exists"
fi

if [ "$failures" -gt 0 ]; then
  echo "Doctor found $failures issue(s)."
  exit 1
fi

echo "Doctor passed with no issues."
