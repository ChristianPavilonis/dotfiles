#!/usr/bin/env bash

set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "bootstrap-vps.sh only supports Linux hosts."
  exit 1
fi

VPS_USER="${VPS_USER:-christian}"
VPS_USER_SHELL="${VPS_USER_SHELL:-/bin/bash}"
VPS_USER_SSH_PUBKEY="${VPS_USER_SSH_PUBKEY:-}"
VPS_COPY_ROOT_AUTH_KEYS="${VPS_COPY_ROOT_AUTH_KEYS:-1}"
VPS_PASSWORDLESS_SUDO="${VPS_PASSWORDLESS_SUDO:-1}"
DISABLE_ROOT_SSH="${DISABLE_ROOT_SSH:-1}"
DISABLE_PASSWORD_SSH="${DISABLE_PASSWORD_SSH:-1}"
DOTFILES_REPO="${DOTFILES_REPO:-}"

TAILSCALE_AUTHKEY="${TAILSCALE_AUTHKEY:-}"
TAILSCALE_HOSTNAME="${TAILSCALE_HOSTNAME:-$(hostname -s)}"
TAILSCALE_TAGS="${TAILSCALE_TAGS:-}"
ENABLE_TAILSCALE_SSH="${ENABLE_TAILSCALE_SSH:-1}"
ALLOW_PUBLIC_SSH="${ALLOW_PUBLIC_SSH:-0}"
SKIP_UFW="${SKIP_UFW:-0}"

ADMIN_GROUP=""

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

detect_admin_group() {
  if getent group sudo >/dev/null 2>&1; then
    ADMIN_GROUP="sudo"
    return
  fi

  if getent group wheel >/dev/null 2>&1; then
    ADMIN_GROUP="wheel"
    return
  fi

  echo "Could not find a sudo-capable group (expected 'sudo' or 'wheel')."
  exit 1
}

provision_admin_user() {
  local user_home
  local root_keys_file
  local temp_keys_file
  local auth_keys_file
  local ssh_dir

  detect_admin_group

  if id "$VPS_USER" >/dev/null 2>&1; then
    echo "User '$VPS_USER' already exists."
  else
    echo "Creating admin user '$VPS_USER'..."
    run_root useradd -m -s "$VPS_USER_SHELL" "$VPS_USER"
  fi

  run_root usermod -aG "$ADMIN_GROUP" "$VPS_USER"

  user_home="$(getent passwd "$VPS_USER" | cut -d: -f6)"
  if [ -z "$user_home" ]; then
    echo "Failed to detect home directory for $VPS_USER"
    exit 1
  fi

  ssh_dir="$user_home/.ssh"
  auth_keys_file="$ssh_dir/authorized_keys"

  run_root install -d -m 0700 -o "$VPS_USER" -g "$VPS_USER" "$ssh_dir"
  run_root touch "$auth_keys_file"
  run_root chown "$VPS_USER:$VPS_USER" "$auth_keys_file"
  run_root chmod 0600 "$auth_keys_file"

  temp_keys_file="$(mktemp)"
  run_root cat "$auth_keys_file" 2>/dev/null >> "$temp_keys_file" || true

  if [ -n "$VPS_USER_SSH_PUBKEY" ]; then
    printf '%s\n' "$VPS_USER_SSH_PUBKEY" >> "$temp_keys_file"
  fi

  if [ "$VPS_COPY_ROOT_AUTH_KEYS" = "1" ]; then
    root_keys_file="/root/.ssh/authorized_keys"
    if run_root test -s "$root_keys_file"; then
      run_root cat "$root_keys_file" >> "$temp_keys_file"
    fi
  fi

  awk 'NF && $1 !~ /^#/' "$temp_keys_file" | awk '!seen[$0]++' > "$temp_keys_file.cleaned"

  run_root install -m 0600 -o "$VPS_USER" -g "$VPS_USER" "$temp_keys_file.cleaned" "$auth_keys_file"

  rm -f "$temp_keys_file" "$temp_keys_file.cleaned"

  if ! run_root test -s "$auth_keys_file"; then
    echo "No SSH keys found for $VPS_USER in $auth_keys_file"
    echo "Provide VPS_USER_SSH_PUBKEY or ensure /root/.ssh/authorized_keys exists."
    exit 1
  fi

  echo "Admin user '$VPS_USER' is ready (group: $ADMIN_GROUP)."
}

configure_passwordless_sudo() {
  if [ "$VPS_PASSWORDLESS_SUDO" != "1" ]; then
    return
  fi

  local sudoers_file="/etc/sudoers.d/$VPS_USER"

  echo "$VPS_USER ALL=(ALL) NOPASSWD:ALL" > /tmp/sudoers-vps-user
  if visudo -cf /tmp/sudoers-vps-user >/dev/null 2>&1; then
    run_root install -m 0440 /tmp/sudoers-vps-user "$sudoers_file"
    echo "Passwordless sudo configured for '$VPS_USER'."
  else
    echo "Warning: failed to validate sudoers file; skipping passwordless sudo."
  fi

  rm -f /tmp/sudoers-vps-user
}

clone_dotfiles() {
  if [ -z "$DOTFILES_REPO" ]; then
    return
  fi

  local user_home
  user_home="$(getent passwd "$VPS_USER" | cut -d: -f6)"
  local dotfiles_dir="$user_home/dotfiles"

  if [ -d "$dotfiles_dir/.git" ]; then
    echo "Dotfiles already cloned at $dotfiles_dir"
    run_root chown -R "$VPS_USER:$VPS_USER" "$dotfiles_dir"
    return
  fi

  echo "Cloning dotfiles from $DOTFILES_REPO..."
  run_root git clone "$DOTFILES_REPO" "$dotfiles_dir"
  run_root chown -R "$VPS_USER:$VPS_USER" "$dotfiles_dir"
  echo "Dotfiles cloned to $dotfiles_dir"
}

confirm_access_safety() {
  local user_home
  local auth_keys_file

  user_home="$(getent passwd "$VPS_USER" | cut -d: -f6)"
  auth_keys_file="$user_home/.ssh/authorized_keys"

  if [ "$DISABLE_ROOT_SSH" = "1" ] || [ "$DISABLE_PASSWORD_SSH" = "1" ]; then
    if ! run_root test -s "$auth_keys_file"; then
      echo "Refusing SSH lock-down: $auth_keys_file is missing or empty."
      exit 1
    fi
  fi
}

install_base_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update
    run_root apt-get install -y \
      build-essential \
      ca-certificates \
      curl \
      git \
      gnupg \
      jq \
      ripgrep \
      stow \
      tmux \
      ufw \
      unattended-upgrades
    run_root systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then
    run_root dnf install -y \
      ca-certificates \
      curl \
      gcc \
      git \
      jq \
      make \
      procps-ng \
      ripgrep \
      stow \
      tmux \
      ufw
  elif command -v yum >/dev/null 2>&1; then
    run_root yum install -y \
      ca-certificates \
      curl \
      gcc \
      git \
      jq \
      make \
      procps-ng \
      ripgrep \
      stow \
      tmux \
      ufw
  else
    echo "Unsupported distro package manager."
    echo "Install manually: curl git stow jq ripgrep tmux ufw ca-certificates"
    exit 1
  fi
}

configure_sshd_hardening() {
  local dropin_path="/etc/ssh/sshd_config.d/99-vps-hardening.conf"
  local password_auth
  local kbd_auth
  local challenge_auth
  local permit_root_login
  local temp_file

  password_auth="yes"
  kbd_auth="yes"
  challenge_auth="yes"
  permit_root_login="yes"

  if [ "$DISABLE_PASSWORD_SSH" = "1" ]; then
    password_auth="no"
    kbd_auth="no"
    challenge_auth="no"
  fi

  if [ "$DISABLE_ROOT_SSH" = "1" ]; then
    permit_root_login="no"
  fi

  temp_file="$(mktemp)"

  cat > "$temp_file" <<'EOF'
PasswordAuthentication __PASSWORD_AUTH__
KbdInteractiveAuthentication __KBD_AUTH__
ChallengeResponseAuthentication __CHALLENGE_AUTH__
PubkeyAuthentication yes
PermitRootLogin __PERMIT_ROOT_LOGIN__
EOF

  sed -i.bak \
    -e "s/__PASSWORD_AUTH__/$password_auth/" \
    -e "s/__KBD_AUTH__/$kbd_auth/" \
    -e "s/__CHALLENGE_AUTH__/$challenge_auth/" \
    -e "s/__PERMIT_ROOT_LOGIN__/$permit_root_login/" \
    "$temp_file"
  rm -f "$temp_file.bak"

  run_root install -d -m 0755 /etc/ssh/sshd_config.d
  run_root install -m 0644 "$temp_file" "$dropin_path"
  rm -f "$temp_file"

  if run_root systemctl restart ssh >/dev/null 2>&1; then
    return
  fi

  run_root systemctl restart sshd >/dev/null 2>&1 || true
}

install_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then
    return
  fi

  echo "Installing Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | run_root bash
}

bring_up_tailscale() {
  run_root systemctl enable --now tailscaled

  if [ -z "$TAILSCALE_AUTHKEY" ]; then
    echo "TAILSCALE_AUTHKEY not set; skipping 'tailscale up'."
    echo "Run manually later: sudo tailscale up --ssh"
    return
  fi

  local up_args
  up_args=(up --authkey "$TAILSCALE_AUTHKEY" --hostname "$TAILSCALE_HOSTNAME")

  if [ "$ENABLE_TAILSCALE_SSH" = "1" ]; then
    up_args+=(--ssh)
  fi

  if [ -n "$TAILSCALE_TAGS" ]; then
    up_args+=(--advertise-tags "$TAILSCALE_TAGS")
  fi

  run_root tailscale "${up_args[@]}"
}

configure_firewall() {
  if [ "$SKIP_UFW" = "1" ]; then
    echo "Skipping UFW configuration (SKIP_UFW=1)."
    return
  fi

  if ! command -v ufw >/dev/null 2>&1; then
    echo "ufw is not installed; skipping firewall setup."
    return
  fi

  if [ "$ALLOW_PUBLIC_SSH" != "1" ]; then
    if ! run_root tailscale ip -4 >/dev/null 2>&1; then
      echo "Warning: Tailscale is not connected. Auto-enabling public SSH (port 22) to avoid lockout."
      echo "Rerun bootstrap after Tailscale is connected to close public SSH."
      ALLOW_PUBLIC_SSH=1
    fi
  fi

  run_root ufw --force reset
  run_root ufw default deny incoming
  run_root ufw default allow outgoing
  run_root ufw allow in on tailscale0

  if [ "$ALLOW_PUBLIC_SSH" = "1" ]; then
    run_root ufw allow 22/tcp
  fi

  run_root ufw --force enable
}

echo "Installing base packages..."
install_base_packages

echo "Provisioning admin user..."
provision_admin_user
configure_passwordless_sudo
confirm_access_safety

echo "Cloning dotfiles..."
clone_dotfiles

echo "Applying SSH hardening..."
configure_sshd_hardening

echo "Installing and configuring Tailscale..."
install_tailscale
bring_up_tailscale

echo "Configuring firewall..."
configure_firewall

print_connection_summary() {
  local user_home
  user_home="$(getent passwd "$VPS_USER" | cut -d: -f6)"

  echo ""
  echo "=============================="
  echo "  VPS bootstrap complete"
  echo "=============================="
  echo ""
  echo "  User:  $VPS_USER"

  local ts_ip=""
  if command -v tailscale >/dev/null 2>&1; then
    ts_ip="$(run_root tailscale ip -4 2>/dev/null || true)"
  fi

  local pub_ip=""
  pub_ip="$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null || true)"

  if [ -n "$ts_ip" ]; then
    echo "  Tailscale IP:  $ts_ip"
    echo "  Connect:       ssh $VPS_USER@$ts_ip"
  fi

  if [ -n "$pub_ip" ]; then
    echo "  Public IP:     $pub_ip"
    if [ "$ALLOW_PUBLIC_SSH" = "1" ]; then
      echo "  Connect:       ssh $VPS_USER@$pub_ip"
    else
      echo "  (port 22 blocked — use Tailscale)"
    fi
  fi

  if [ -d "$user_home/dotfiles" ]; then
    echo "  Dotfiles:      $user_home/dotfiles"
  fi

  echo ""
  echo "  Next steps:"
  echo "    ssh $VPS_USER@${ts_ip:-$pub_ip}"
  echo "    cd ~/dotfiles"
  echo "    ./scripts/install-tools-vps.sh"
  echo "    ./scripts/doctor-vps.sh"
  echo ""
}

print_connection_summary
