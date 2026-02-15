#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_MISE_FILE="${VPS_MISE_FILE:-$ROOT_DIR/mise.vps.toml}"
TAILSCALE_REQUIRED="${TAILSCALE_REQUIRED:-1}"
PUBLIC_SSH_ALLOWED="${PUBLIC_SSH_ALLOWED:-0}"

if [ "$(uname -s)" != "Linux" ]; then
  echo "doctor-vps.sh only supports Linux hosts."
  exit 1
fi

failures=0

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

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

list_vps_mise_tools() {
  local config_file="$1"

  python3 - "$config_file" <<'PY'
import sys
import tomllib

path = sys.argv[1]
with open(path, "rb") as f:
    data = tomllib.load(f)

for tool, spec in data.get("tools", {}).items():
    if isinstance(spec, str):
        print(f"{tool}@{spec}")
    elif isinstance(spec, dict) and isinstance(spec.get("version"), str):
        print(f"{tool}@{spec['version']}")
PY
}

echo "Running VPS doctor checks..."

check_cmd git
check_cmd stow
check_cmd curl
check_cmd ufw
check_cmd tailscale
check_cmd mise

if command -v tailscale >/dev/null 2>&1; then
  if run_root tailscale ip -4 >/dev/null 2>&1; then
    pass "tailscale connected"
  elif [ "$TAILSCALE_REQUIRED" = "1" ]; then
    fail "tailscale is not connected"
  else
    pass "tailscale not required"
  fi
fi

if command -v ufw >/dev/null 2>&1; then
  ufw_status="$(run_root ufw status 2>/dev/null || true)"
  if [[ "$ufw_status" == *"Status: active"* ]]; then
    pass "ufw active"
  else
    fail "ufw is not active"
  fi

  if [ "$PUBLIC_SSH_ALLOWED" != "1" ] && [[ "$ufw_status" == *"22/tcp"*"ALLOW"* ]]; then
    fail "public SSH appears open in ufw rules"
  fi
fi

if command -v sshd >/dev/null 2>&1; then
  sshd_settings="$(run_root sshd -T 2>/dev/null || true)"

  if [[ "$sshd_settings" == *"passwordauthentication no"* ]]; then
    pass "sshd password auth disabled"
  else
    fail "sshd password auth not disabled"
  fi

  if [[ "$sshd_settings" == *"permitrootlogin no"* ]]; then
    pass "sshd root login disabled"
  else
    fail "sshd root login not disabled"
  fi
fi

if command -v mise >/dev/null 2>&1 && [ -f "$VPS_MISE_FILE" ]; then
  while IFS= read -r tool_spec; do
    if [ -z "$tool_spec" ]; then
      continue
    fi

    if mise where "$tool_spec" >/dev/null 2>&1; then
      pass "$tool_spec installed"
    else
      fail "$tool_spec missing"
    fi
  done < <(list_vps_mise_tools "$VPS_MISE_FILE")
fi

if [ "$failures" -gt 0 ]; then
  echo "VPS doctor found $failures issue(s)."
  exit 1
fi

echo "VPS doctor passed."
