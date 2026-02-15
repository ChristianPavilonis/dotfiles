#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/audit/latest}"

mkdir -p "$OUT_DIR"

write_not_found() {
  local path="$1"
  local name="$2"
  printf '%s not found\n' "$name" > "$path"
}

echo "Collecting tool audit into: $OUT_DIR"

{
  echo "timestamp_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "hostname: $(hostname)"
  echo "os: $(uname -s)"
  echo "arch: $(uname -m)"
} > "$OUT_DIR/system.txt"

{
  echo "brew: $(command -v brew || true)"
  echo "mise: $(command -v mise || true)"
  echo "rustup: $(command -v rustup || true)"
  echo "cargo: $(command -v cargo || true)"
  echo "cargo-binstall: $(command -v cargo-binstall || true)"
  echo "bun: $(command -v bun || true)"
  echo "java: $(command -v java || true)"
  echo "ruby: $(command -v ruby || true)"
  echo "gradle: $(command -v gradle || true)"
  echo "php: $(command -v php || true)"
  echo "node: $(command -v node || true)"
} > "$OUT_DIR/paths.txt"

if command -v brew >/dev/null 2>&1; then
  brew --version > "$OUT_DIR/brew-version.txt"
  brew leaves > "$OUT_DIR/brew-leaves.txt"
  brew list --formula > "$OUT_DIR/brew-formulae.txt"
  brew list --cask > "$OUT_DIR/brew-casks.txt"
else
  write_not_found "$OUT_DIR/brew-version.txt" "brew"
fi

if command -v mise >/dev/null 2>&1; then
  mise --version > "$OUT_DIR/mise-version.txt"
  mise ls -C "$HOME" > "$OUT_DIR/mise-ls.txt" || true
  mise ls --current -C "$HOME" > "$OUT_DIR/mise-current.txt" || true
else
  write_not_found "$OUT_DIR/mise-version.txt" "mise"
fi

if command -v rustup >/dev/null 2>&1; then
  rustup --version > "$OUT_DIR/rustup-version.txt"
  rustup toolchain list > "$OUT_DIR/rustup-toolchains.txt"
else
  write_not_found "$OUT_DIR/rustup-version.txt" "rustup"
fi

if command -v cargo >/dev/null 2>&1; then
  cargo --version > "$OUT_DIR/cargo-version.txt"
  cargo install --list > "$OUT_DIR/cargo-install-list.txt"
else
  write_not_found "$OUT_DIR/cargo-version.txt" "cargo"
fi

if [ -f "$HOME/.cargo/.crates2.json" ]; then
  python3 - "$HOME/.cargo/.crates2.json" > "$OUT_DIR/cargo-install-sources.txt" <<'PY'
import json
import re
import sys
from collections import Counter

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

counter = Counter()
for key in data.get("installs", {}).keys():
    match = re.search(r"\(([^)]+)\)$", key)
    source = "unknown"
    if match:
        source = match.group(1).split("+", 1)[0]
    counter[source] += 1

for source in sorted(counter.keys()):
    print(f"{source}: {counter[source]}")
PY
fi

if command -v bun >/dev/null 2>&1; then
  bun --version > "$OUT_DIR/bun-version.txt"
fi

if command -v node >/dev/null 2>&1; then
  node --version > "$OUT_DIR/node-version.txt"
fi

if command -v java >/dev/null 2>&1; then
  java -version > "$OUT_DIR/java-version.txt" 2>&1 || true
fi

if command -v ruby >/dev/null 2>&1; then
  ruby --version > "$OUT_DIR/ruby-version.txt"
fi

if command -v gradle >/dev/null 2>&1; then
  gradle --version > "$OUT_DIR/gradle-version.txt" || true
fi

if command -v php >/dev/null 2>&1; then
  php -v > "$OUT_DIR/php-version.txt"
fi

if command -v mise >/dev/null 2>&1 && [ -f "$ROOT_DIR/mise.toml" ]; then
  mise exec -C "$ROOT_DIR" -- node -v > "$OUT_DIR/mise-node-version.txt" 2>&1 || true
  mise exec -C "$ROOT_DIR" -- java -version > "$OUT_DIR/mise-java-version.txt" 2>&1 || true
  mise exec -C "$ROOT_DIR" -- ruby -v > "$OUT_DIR/mise-ruby-version.txt" 2>&1 || true
  mise exec -C "$ROOT_DIR" -- gradle -v > "$OUT_DIR/mise-gradle-version.txt" 2>&1 || true
fi

echo "Audit complete."
echo "Generated files:"
ls -1 "$OUT_DIR"
