let-env PATH = ($env.PATH | append '/Users/christian/.cargo/bin')
let-env PATH = ($env.PATH | append '/opt/homebrew/bin')
let-env PATH = ($env.PATH | append '/usr/local/bin')
let-env PATH = ($env.PATH | append '/Users/christian/.composer/vendor/bin')
let-env PATH = ($env.PATH | append '/Users/christian/.yarn/bin')
let-env PATH = ($env.PATH | append '/usr/local/go/bin')
let-env PATH = ($env.PATH | append '/Users/christian/Library/Application Support/JetBrains/Toolbox/scripts')
let-env PATH = ($env.PATH | append '/Users/christian/Library/Application Support/Herd/bin')
let-env PATH = ($env.PATH | append '/Users/christian/.bun/bin')

let-env TWITCH_OAUTH = "oauth:h3d0rwba6n0z0is9nrlckoeiqd4o5l"
let-env OPENSSL_CONF = "/Users/christian/Library/Application Support/Herd/config/php/openssl.cnf"

zoxide init nushell --hook prompt | save ~/.zoxide.nu -f

# Aliases
alias vim = nvim

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
alias gpsup = (git push --set-upstream origin (git rev-parse --abbrev-ref HEAD | str trim))
alias gwip = (git add -A; git rm (git ls-files --deleted) 2> /dev/null; git commit --no-verify -m "--wip-- [skip ci]")
alias gm = git merge
alias gb = (git branch | lines)
alias gbcp = (git branch --show-current | str trim | pbcopy)
alias glog = (git log --pretty=%h»¦«%s»¦«%aN»¦«%aE»¦«%aD -n 25 | lines | split column "»¦«" commit subject name email date | upsert date {|d| $d.date | into datetime} | where ($it.date > ((date now) - 7day)))
alias gbdm = (git branch --merged | egrep -v "(^\*|master|main|dev)" | xargs git branch -d)

alias repolc = (git ls-files | xargs wc -l)

alias quickpr = (gh pr create --base master --fill --assignee @me --head --title (git branch --show-current | str trim))

alias docker-sweep = (docker ps -a -q | split row "\n" | par-each { |it| docker stop $it; docker rm $it })
alias dc = docker compose
alias dcx = dc exec

alias docker-switch = (docker-sweep; dc up -d)

alias commit = ~/Projects/amish-commit/src-tauri/target/release/amish-commit

alias vitest = ./node_modules/bin/vitest

alias cwd = (pwd | pbcopy)

source ~/.nu-scripts/php.nu
source ~/.cache/starship/init.nu
source ~/.zoxide.nu
