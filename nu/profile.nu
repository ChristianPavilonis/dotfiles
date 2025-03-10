# Paths!

$env.PATH = ($env.PATH | append '/Users/christian/.cargo/bin')
$env.PATH = ($env.PATH | append '/opt/homebrew/bin')
$env.PATH = ($env.PATH | append '/usr/local/bin')
$env.PATH = ($env.PATH | append '/Users/christian/.composer/vendor/bin')
$env.PATH = ($env.PATH | append '/Users/christian/.yarn/bin')
$env.PATH = ($env.PATH | append '/usr/local/go/bin')
$env.PATH = ($env.PATH | append '/Users/christian/Library/Application Support/JetBrains/Toolbox/scripts')
$env.PATH = ($env.PATH | append '/Users/christian/Library/Application Support/Herd/bin')
$env.PATH = ($env.PATH | append '/Users/christian/.bun/bin')
$env.PATH = ($env.PATH | append '/Users/christian/.rbenv/versions/3.3.0/bin')
$env.PATH = ($env.PATH | append '/Users/christian/.deno/bin')
$env.PATH = ($env.PATH | append '/Users/christian/.pyenv/shims')
$env.PATH = ($env.PATH | append '/Users/christian/.local/bin')
$env.PATH = ($env.PATH | append '/System/Volumes/Data/opt/podman/bin')

$env.OPENSSL_CONF = "/System/Library/OpenSSL/openssl.cnf"
$env.TAURI_PRIVATE_KEY = (cat /Users/christian/.tauri/geapp.key)

$env.OPENSSL_DIR = "/opt/homebrew/opt/openssl@3.4/"

# esp32 vars
$env.LIBCLANG_PATH = "/Users/christian/.rustup/toolchains/esp/xtensa-esp32-elf-clang/esp-17.0.1_20240419/esp-clang/lib"
$env.PATH = ($env.PATH | append '/Users/christian/.rustup/toolchains/esp/xtensa-esp-elf/esp-13.2.0_20230928/xtensa-esp-elf/bin')

## android

$env.PATH = ($env.PATH | append '/opt/homebrew/opt/openjdk@17/bin')
$env.JAVA_HOME = '/opt/homebrew/opt/openjdk@17'

$env.ANDROID_HOME = "/Users/christian/Library/Android/sdk/"
$env.NDK_HOME = "/Users/christian/Library/Android/sdk/ndk/28.0.12433566/"

# $env.RUST_LOG = "debug"

# Aliases
# neovim btw™
alias vim = nvim

# Docker
alias dc = docker compose
alias dcx = dc exec

# clean up all them containers
def docker-sweep [] {
	let containers = docker ps -a -q 
	let no_containers = $containers | is-empty
	if $no_containers {
		echo "No containers to sweep up 🧹"
	} else {
		$containers | split row "\n" | par-each { |it| docker stop $it; docker rm $it }
	}
}
# cleanup one project and spin up another
def docker-switch [] {
	docker-sweep
	dc up -d
}

# mac open
alias mopen = /usr/bin/open

alias commit = ~/Projects/amish-commit/src-tauri/target/release/amish-commit
alias vitest = ./node_modules/bin/vitest

# Copy the working directory path
def cwd [] {
	pwd | pbcopy
	echo "📋 Copied the current working directory"
}

def lsofi [port] {
    lsof -i ($":($port)") | detect columns
}

def killop [port] {
    lsofi ($port) | each { |it| kill ($it.PID | into int) }
}


# Yazi
def --env y [...args] {
	let tmp = (mktemp -t "yazi-cwd.XXXXXX")
	yazi ...$args --cwd-file $tmp
	let cwd = (open $tmp)
	if $cwd != "" and $cwd != $env.PWD {
		cd $cwd
	}
	rm -fp $tmp
}


source ./git.nu
source ./php.nu
source ./rust.nu
source ./zoxide.nu


use ~/.cache/starship/init.nu
