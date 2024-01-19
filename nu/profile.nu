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

$env.OPENSSL_CONF = "/Users/christian/Library/Application Support/Herd/config/php/openssl.cnf"

# Aliases
# neovim btw™
alias vim = nvim

# Git
alias gst = git status
alias gco = git checkout
alias gcb = git checkout -b
alias gcm = git checkout master
alias ga = git add
alias gaa = git add .
alias gc = git commit
alias gcmsg = git commit -m
alias gl = git pull
alias gp = git push
alias gm = git merge

def gb [] {
	git branch | lines
}

# copy current branch name
def gbcp [] {
	git branch --show-current | str trim | pbcopy
}
# nice looking logs from this week
def glog [] {
	git log --pretty=%h»¦«%s»¦«%aN»¦«%aE»¦«%aD -n 25 | lines | split column "»¦«" commit subject name email date | upsert date {|d| $d.date | into datetime} | where ($it.date > ((date now) - 7day))
}
# I don't remember
def gbdm [] {
	git branch --merged | egrep -v "(^\*|master|main|dev)" | xargs git branch -d
}
# how many lines in this repo
def repolc [] {
	git ls-files | xargs wc -l
)
# make a pr using git hub cli
def quickpr [] {
	gh pr create --base master --fill --assignee @me --head --title (git branch --show-current | str trim)
}

# Docker
alias dc = docker compose
alias dcx = dc exec

# clean up all them containers
def docker-sweep [] {
	docker ps -a -q | split row "\n" | par-each { |it| docker stop $it; docker rm $it }
}
# cleanup one project and spin up another
def docker-switch [] {
	docker-sweep; dc up -d
}

alias commit = ~/Projects/amish-commit/src-tauri/target/release/amish-commit
alias vitest = ./node_modules/bin/vitest

# Copy the working directory path
def cwd [] {
	pwd | pbcopy
}

source ./php.nu
source ./zoxide.nu
use ~/.cache/starship/init.nu
