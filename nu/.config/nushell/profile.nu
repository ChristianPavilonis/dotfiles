const IS_MACOS = ($nu.os-info.name == "macos")
const IS_LINUX = ($nu.os-info.name == "linux")

def --env append-path-if-exists [candidate: string] {
  let resolved = ($candidate | path expand)
  if ($resolved | path exists) and ($resolved not-in $env.PATH) {
    $env.PATH = ($env.PATH | append $resolved)
  }
}

for candidate in [
  "~/.cargo/bin"
  "~/.composer/vendor/bin"
  "~/.yarn/bin"
  "~/.bun/bin"
  "~/.deno/bin"
  "~/.pyenv/shims"
  "~/.local/bin"
  "~/.opencode/bin"
  "/usr/local/bin"
  "/usr/local/go/bin"
] {
  append-path-if-exists $candidate
}

if $IS_MACOS {
  for candidate in [
    "/opt/homebrew/bin"
    "/opt/homebrew/opt/openssl@3.6/bin"
    "~/Library/Application Support/JetBrains/Toolbox/scripts"
    "~/Library/Application Support/Herd/bin"
    "/System/Volumes/Data/opt/podman/bin"
    "~/Library/Python/3.9/bin"
  ] {
    append-path-if-exists $candidate
  }
}

if $IS_LINUX {
  append-path-if-exists "/home/linuxbrew/.linuxbrew/bin"
}

$env.OLLAMA_API_BASE_URL = "http://localhost:11434"

let openssl_conf = "/System/Library/OpenSSL/openssl.cnf"
if ($openssl_conf | path exists) {
  $env.OPENSSL_CONF = $openssl_conf
}

let tauri_key_path = ("~/.tauri/geapp.key" | path expand)
if ($tauri_key_path | path exists) {
  $env.TAURI_PRIVATE_KEY = (open $tauri_key_path | str trim)
}

let openssl_dirs = [
  "/opt/homebrew/opt/openssl@3.6"
  "/opt/homebrew/opt/openssl@3.5"
  "/opt/homebrew/opt/openssl@3.4"
]
let existing_openssl_dirs = ($openssl_dirs | where { |path| $path | path exists })
if (($existing_openssl_dirs | length) > 0) {
  $env.OPENSSL_DIR = ($existing_openssl_dirs | first)
}

let esp_libclang = ("~/.rustup/toolchains/esp/xtensa-esp32-elf-clang/esp-17.0.1_20240419/esp-clang/lib" | path expand)
if ($esp_libclang | path exists) {
  $env.LIBCLANG_PATH = $esp_libclang
}

let esp_toolchain_bin = ("~/.rustup/toolchains/esp/xtensa-esp-elf/esp-13.2.0_20230928/xtensa-esp-elf/bin" | path expand)
append-path-if-exists $esp_toolchain_bin

let android_sdk_candidates = ([
  "~/Library/Android/sdk"
  "~/Android/Sdk"
] | each { |path| $path | path expand } | where { |path| $path | path exists })

if (($android_sdk_candidates | length) > 0) {
  let android_sdk = ($android_sdk_candidates | first)
  $env.ANDROID_HOME = $android_sdk

  let pinned_ndk = ($android_sdk | path join "ndk" "28.0.12433566")
  if ($pinned_ndk | path exists) {
    $env.NDK_HOME = $pinned_ndk
  }
}

$env.RUST_LOG = "info"

alias vim = nvim
alias dc = docker compose
alias dcx = dc exec
alias commit = ~/Projects/amish-commit/src-tauri/target/release/amish-commit
alias vitest = ./node_modules/bin/vitest

def copy-to-clipboard [value: string] {
  if (which pbcopy | is-not-empty) {
    $value | encode utf8 | ^pbcopy
  } else if (which wl-copy | is-not-empty) {
    $value | encode utf8 | ^wl-copy
  } else if (which xclip | is-not-empty) {
    $value | encode utf8 | ^xclip -selection clipboard
  } else if (which xsel | is-not-empty) {
    $value | encode utf8 | ^xsel --clipboard --input
  } else {
    print "No clipboard utility found (pbcopy/wl-copy/xclip/xsel)."
  }
}

def docker-sweep [] {
  let containers = (docker ps -a -q)
  if ($containers | is-empty) {
    print "No containers to sweep up"
  } else {
    $containers | split row "\n" | par-each { |id| docker stop $id; docker rm $id }
  }
}

def docker-switch [] {
  docker-sweep
  dc up -d
}

def mopen [target: string] {
  if $IS_MACOS {
    ^open $target
  } else if (which xdg-open | is-not-empty) {
    ^xdg-open $target
  } else {
    print "No opener found (open/xdg-open)."
  }
}

def cwd [] {
  let here = (pwd | path expand)
  copy-to-clipboard $here
  print "Copied the current working directory"
}

def lsofi [port] {
  lsof -i ($":($port)") | detect columns
}

def killop [port] {
  lsofi $port | each { |entry| kill ($entry.PID | into int) }
}

def --env y [...args] {
  let tmp = (mktemp)
  yazi ...$args --cwd-file $tmp
  let cwd = (open $tmp)
  if $cwd != "" and $cwd != $env.PWD {
    cd $cwd
  }
  rm -fp $tmp
}

def ts_start [name] {
  let env_file = ($"~/Projects/stackpop/envs/.env.($name)" | path expand)
  if not ($env_file | path exists) {
    print $"Missing env file: ($env_file)"
    return
  }

  open $env_file
    | lines
    | where { |line| not ($line | str starts-with "#") }
    | parse "{k}={v}"
    | reduce -f {} { |entry, acc| $acc | merge { $entry.k: $entry.v } }
    | load-env

  cargo build
  fastly compute serve
}

def ff [] {
  if (which aerospace | is-empty) {
    print "aerospace is not installed"
    return
  }

  aerospace list-windows --all | fzf --bind 'enter:execute(bash -c "aerospace focus --window-id {1}")+abort'
}

source ./git.nu
source ./opencode.nu
source ./php.nu
source ./rust.nu
source ./zoxide.nu
source ./zellij.nu

use ~/.cache/starship/init.nu
