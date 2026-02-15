#!/usr/bin/env bash

set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "bootstrap-vps.sh only supports Linux hosts."
  exit 1
fi

TAILSCALE_AUTHKEY="${TAILSCALE_AUTHKEY:-}"
TAILSCALE_HOSTNAME="${TAILSCALE_HOSTNAME:-$(hostname -s)}"
TAILSCALE_TAGS="${TAILSCALE_TAGS:-}"
ENABLE_TAILSCALE_SSH="${ENABLE_TAILSCALE_SSH:-1}"
ALLOW_PUBLIC_SSH="${ALLOW_PUBLIC_SSH:-0}"
SKIP_UFW="${SKIP_UFW:-0}"

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_base_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update
    run_root apt-get install -y \
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
      git \
      jq \
      procps-ng \
      ripgrep \
      stow \
      tmux \
      ufw
  elif command -v yum >/dev/null 2>&1; then
    run_root yum install -y \
      ca-certificates \
      curl \
      git \
      jq \
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
  local temp_file
  temp_file="$(mktemp)"

  cat > "$temp_file" <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
EOF

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
      echo "Refusing to lock down SSH without an active Tailscale connection."
      echo "Either set TAILSCALE_AUTHKEY and rerun, or set ALLOW_PUBLIC_SSH=1 for first boot."
      exit 1
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

echo "Applying SSH hardening..."
configure_sshd_hardening

echo "Installing and configuring Tailscale..."
install_tailscale
bring_up_tailscale

echo "Configuring firewall..."
configure_firewall

echo "VPS bootstrap complete."
echo "Next: run ./scripts/install-tools-vps.sh as your normal user."
