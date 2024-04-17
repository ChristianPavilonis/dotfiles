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

$env.OPENSSL_CONF = "/Users/christian/Library/Application Support/Herd/config/php/openssl.cnf"
$env.TAURI_PRIVATE_KEY = (cat /Users/christian/.tauri/geapp.key)
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

alias commit = ~/Projects/amish-commit/src-tauri/target/release/amish-commit
alias vitest = ./node_modules/bin/vitest

# Copy the working directory path
def cwd [] {
	pwd | pbcopy
	echo "📋 Copied the current working directory"
}

source ./git.nu
source ./php.nu
source ./rust.nu
source ./zoxide.nu
use ~/.cache/starship/init.nu
