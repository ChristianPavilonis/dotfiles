#!/usr/bin/env bash

set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "Skipping Linux prereqs: current OS is not Linux."
  exit 0
fi

SUDO=()
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO=(sudo)
  else
    echo "sudo is required to install Linux prerequisites."
    exit 1
  fi
fi

echo "Installing Linux prerequisites for Homebrew..."

if command -v apt-get >/dev/null 2>&1; then
  "${SUDO[@]}" apt-get update
  "${SUDO[@]}" apt-get install -y build-essential procps curl file git ca-certificates
elif command -v dnf >/dev/null 2>&1; then
  "${SUDO[@]}" dnf install -y gcc gcc-c++ make procps-ng curl file git ca-certificates
elif command -v yum >/dev/null 2>&1; then
  "${SUDO[@]}" yum install -y gcc gcc-c++ make procps-ng curl file git ca-certificates
elif command -v pacman >/dev/null 2>&1; then
  "${SUDO[@]}" pacman -Sy --needed --noconfirm base-devel procps-ng curl file git ca-certificates
elif command -v zypper >/dev/null 2>&1; then
  "${SUDO[@]}" zypper --non-interactive install gcc gcc-c++ make procps curl file git ca-certificates
else
  echo "No supported package manager found."
  echo "Install these manually, then rerun bootstrap: gcc/g++/make, procps, curl, file, git, ca-certificates"
  exit 1
fi

echo "Linux prerequisites installed."
