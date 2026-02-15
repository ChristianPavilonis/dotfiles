#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_USER="${VPS_USER:-christian}"
VPS_MISE_FILE="${VPS_MISE_FILE:-$ROOT_DIR/mise.vps.toml}"
TAILSCALE_REQUIRED="${TAILSCALE_REQUIRED:-1}"
PUBLIC_SSH_ALLOWED="${PUBLIC_SSH_ALLOWED:-0}"
EXPECT_ROOT_SSH_DISABLED="${EXPECT_ROOT_SSH_DISABLED:-1}"
EXPECT_PASSWORD_SSH_DISABLED="${EXPECT_PASSWORD_SSH_DISABLED:-1}"

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

detect_admin_group() {
  if getent group sudo >/dev/null 2>&1; then
    echo "sudo"
    return
  fi

  if getent group wheel >/dev/null 2>&1; then
    echo "wheel"
    return
  fi

  echo ""
}

check_admin_user() {
  local admin_group
  local user_home
  local auth_keys_file

  if id "$VPS_USER" >/dev/null 2>&1; then
    pass "user '$VPS_USER' exists"
  else
    fail "user '$VPS_USER' does not exist"
    return
  fi

  admin_group="$(detect_admin_group)"
  if [ -n "$admin_group" ]; then
    if id -nG "$VPS_USER" | tr ' ' '\n' | grep -Fx "$admin_group" >/dev/null 2>&1; then
      pass "user '$VPS_USER' is in '$admin_group' group"
    else
      fail "user '$VPS_USER' is not in '$admin_group' group"
    fi
  else
    fail "no admin group found (sudo/wheel)"
  fi

  user_home="$(getent passwd "$VPS_USER" | cut -d: -f6)"
  auth_keys_file="$user_home/.ssh/authorized_keys"

  if run_root test -s "$auth_keys_file"; then
    pass "user '$VPS_USER' has authorized SSH keys"
  else
    fail "user '$VPS_USER' has no authorized SSH keys at $auth_keys_file"
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

check_passwordless_sudo() {
  if sudo -n true 2>/dev/null; then
    pass "passwordless sudo works for current user"
  else
    fail "passwordless sudo not configured for current user"
  fi
}

check_dotfiles() {
  local user_home
  user_home="$(getent passwd "$VPS_USER" | cut -d: -f6)"
  local dotfiles_dir="$user_home/dotfiles"

  if [ -d "$dotfiles_dir/.git" ]; then
    pass "dotfiles repo present at $dotfiles_dir"
  else
    fail "dotfiles repo not found at $dotfiles_dir"
  fi

  if [ -d "$dotfiles_dir" ]; then
    local owner
    owner="$(stat -c '%U' "$dotfiles_dir" 2>/dev/null || true)"
    if [ "$owner" = "$VPS_USER" ]; then
      pass "dotfiles owned by $VPS_USER"
    elif [ -n "$owner" ]; then
      fail "dotfiles owned by '$owner', expected '$VPS_USER'"
    fi
  fi
}

echo "Running VPS doctor checks..."

check_admin_user
check_passwordless_sudo
check_dotfiles

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

sshd_bin="$(command -v sshd || true)"
if [ -z "$sshd_bin" ] && run_root test -x /usr/sbin/sshd; then
  sshd_bin="/usr/sbin/sshd"
fi

if [ -n "$sshd_bin" ]; then
  sshd_settings="$(run_root "$sshd_bin" -T 2>/dev/null || true)"

  if [ "$EXPECT_PASSWORD_SSH_DISABLED" = "1" ]; then
    if [[ "$sshd_settings" == *"passwordauthentication no"* ]]; then
      pass "sshd password auth disabled"
    else
      fail "sshd password auth not disabled"
    fi
  else
    pass "password auth lock-down not required"
  fi

  if [ "$EXPECT_ROOT_SSH_DISABLED" = "1" ]; then
    if [[ "$sshd_settings" == *"permitrootlogin no"* ]]; then
      pass "sshd root login disabled"
    else
      fail "sshd root login not disabled"
    fi
  else
    pass "root SSH lock-down not required"
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
