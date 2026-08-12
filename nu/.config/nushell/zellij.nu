# Zellij Sessionizer

const ZELLIJ_SWITCH_PLUGIN = "https://github.com/mostafaqanbaryan/zellij-switch/releases/download/0.2.1/zellij-switch.wasm"
const SCRIPT_DIR = (path self | path dirname)

def dir-atime [dir: string] {
    if ($nu.os-info.name == "macos") {
        ^stat -f "%a" $dir | str trim | into int
    } else {
        ^stat -c "%X" $dir | str trim | into int
    }
}

# Generate the list of project directories with zellij session status annotations
def zellij-sessionizer-list [] {
    let search_paths = if ($env | get -o ZELLIJ_SESSIONIZER_SEARCH_PATHS | is-not-empty) {
        $env.ZELLIJ_SESSIONIZER_SEARCH_PATHS | split row " "
    } else {
        [$"($env.HOME)/Projects", $"($env.HOME)/Code"]
    }

    let specific_paths = if ($env | get -o ZELLIJ_SESSIONIZER_SPECIFIC_PATHS | is-not-empty) {
        $env.ZELLIJ_SESSIONIZER_SPECIFIC_PATHS | split row " "
    } else {
        [$"($env.HOME)/dotfiles", $"($env.HOME)/dotfiles/nvim/.config/nvim"]
    }

    # Collect first-level directories from search paths
    let search_dirs = $search_paths
        | where { |p| $p | path exists }
        | each { |p| ls $p | where type == dir | get name }
        | flatten

    # Collect specific paths that exist
    let specific_dirs = $specific_paths
        | where { |p| $p | path exists }

    # Combine and sort by access time (most recent first)
    let all_dirs = $search_dirs | append $specific_dirs
        | each { |dir| { atime: (try { dir-atime $dir } catch { 0 }), path: $dir } }
        | sort-by atime --reverse
        | get path

    # Get zellij session info
    let sessions = if (which zellij | is-not-empty) {
        try {
            zellij ls -n err>| ignore
                | lines
                | where { |line| $line | is-not-empty }
                | each { |line|
                    let name = $line | split row " " | first
                    let status = if ($line | str contains "(current)") {
                        $" (ansi green_bold)\(current\)(ansi reset)"
                    } else if ($line | str contains "(EXITED") {
                        $" (ansi green)\(exited\)(ansi reset)"
                    } else {
                        $" (ansi green)\(active\)(ansi reset)"
                    }
                    { name: $name, status: $status }
                }
        } catch {
            []
        }
    } else {
        []
    }

    # Build display list
    $all_dirs | each { |dir|
        let display = $dir | str replace $env.HOME "~"
        let session_name = $dir | path basename
        let session = $sessions | where name == $session_name | get -o 0
        if ($session | is-not-empty) {
            $"($display)($session.status)"
        } else {
            $display
        }
    } | str join "\n"
}

# Zellij sessionizer - fuzzy pick a project and open/attach a zellij session
def zs [] {
    let switch_plugin = if ($env | get -o ZELLIJ_SESSIONIZER_SWITCH_PLUGIN | is-not-empty) {
        $env.ZELLIJ_SESSIONIZER_SWITCH_PLUGIN
    } else {
        $ZELLIJ_SWITCH_PLUGIN
    }
    let layout = if ($env | get -o ZELLIJ_SESSIONIZER_LAYOUT | is-not-empty) {
        $env.ZELLIJ_SESSIONIZER_LAYOUT
    } else {
        "blank"
    }

    # Helper scripts live alongside this file (bash needed for fzf execute/reload)
    let action_script = $"($SCRIPT_DIR)/zellij-session-action.sh"
    let list_script = $"($SCRIPT_DIR)/zellij-session-list.sh"

    let selected = (zellij-sessionizer-list
        | fzf --ansi
            --prompt "Select project: "
            --header "Enter: Select | Ctrl+D: Delete Session | Ctrl+K: Kill Session"
            --bind $"ctrl-d:execute\(($action_script) delete {})+reload\(($list_script))"
            --bind $"ctrl-k:execute\(($action_script) kill {})+reload\(($list_script))"
        | str trim)

    if ($selected | is-empty) {
        return
    }

    # Clean selected line: strip ansi codes and status suffix
    let clean_display = $selected | ansi strip | split row " (" | first
    let selected_dir = if ($clean_display | str starts-with "~") {
        $env.HOME + ($clean_display | str substring 1..)
    } else {
        $clean_display
    }

    let session_name = $selected_dir | path basename

    if ($env | get -o ZELLIJ | is-not-empty) {
        zellij pipe --plugin $switch_plugin -- $"--session ($session_name) --cwd ($selected_dir) --layout ($layout)"
    } else {
        zellij attach $session_name --create options --default-cwd $selected_dir --default-layout $layout
    }
}

# Pi agents across Zellij sessions

def pi-zellij-agent-state-dir [] {
    let explicit = $env | get -o PI_ZELLIJ_AGENT_STATE_DIR | default ""
    if ($explicit | is-not-empty) {
        $explicit
    } else {
        let cache_home = $env | get -o XDG_CACHE_HOME | default $"($env.HOME)/.cache"
        $cache_home | path join "pi-zellij-agents"
    }
}

def pi-zellij-agent-records [] {
    let state_dir = pi-zellij-agent-state-dir
    if not ($state_dir | path exists) {
        return []
    }

    glob ($state_dir | path join "*.json")
        | each { |record_path|
            try {
                open $record_path | merge { _path: $record_path }
            } catch {
                null
            }
        }
        | compact
}

def pi-zellij-live-agents [] {
    pi-zellij-agent-records
        | each { |record|
            let pid_check = do { ^/bin/kill -0 $record.pid } | complete
            if $pid_check.exit_code != 0 {
                rm -f $record._path
                null
            } else {
                let pane_number = $record.paneId | str replace "terminal_" "" | into int
                $record | merge { paneNumber: $pane_number }
            }
        }
        | compact
}

def pi-zellij-live-agents-in-session [session: string] {
    pi-zellij-live-agents | where zellijSession == $session
}

def pi-zellij-agent-cursor-path [session: string] {
    let safe_session = $session | str replace --all --regex '[^A-Za-z0-9_.-]' '_'
    pi-zellij-agent-state-dir | path join $"cursor-($safe_session).txt"
}

def pi-zellij-focus-agent [session: string, agent: record] {
    let state_dir = pi-zellij-agent-state-dir
    mkdir $state_dir
    $agent.paneId | save --force (pi-zellij-agent-cursor-path $session)
    let result = do { ^zellij --session $session action focus-pane-id $agent.paneId } | complete
    let message = $"($result.stdout)($result.stderr)"
    if ($result.exit_code != 0) and (not ($message | str contains "already focused")) {
        let record_path = $agent | get -o _path
        if ($record_path | is-not-empty) {
            rm -f $record_path
        }
        error make { msg: ($message | str trim) }
    }
}

def pi-zellij-switch-session [session: string] {
    let result = do { ^zellij pipe --plugin $ZELLIJ_SWITCH_PLUGIN -- $"--session ($session)" } | complete
    if $result.exit_code != 0 {
        error make { msg: ($"($result.stdout)($result.stderr)" | str trim) }
    }
}

def pi-zellij-cycle-agent [session: string, agents: table, direction: int] {
    if ($agents | is-empty) {
        return
    }

    let ordered = $agents | sort-by paneNumber
    let cursor_path = pi-zellij-agent-cursor-path $session
    let cursor = if ($cursor_path | path exists) {
        open --raw $cursor_path | str trim
    } else {
        ""
    }
    let current_index = $ordered
        | get paneId
        | enumerate
        | where item == $cursor
        | get -o 0.index
    let count = $ordered | length
    let target_index = if ($current_index | is-empty) {
        if $direction > 0 { 0 } else { $count - 1 }
    } else {
        ($current_index + $direction + $count) mod $count
    }

    pi-zellij-focus-agent $session ($ordered | get $target_index)
}

# Navigate Pi agents. latest-idle considers all Zellij sessions; next, previous,
# and list remain scoped to the current session.
# Actions: latest-idle, next, previous, list.
def za [action: string = "list"] {
    let session = $env | get -o ZELLIJ_SESSION_NAME | default ""
    if ($session | is-empty) {
        error make { msg: "za must run inside Zellij" }
    }

    let agents = pi-zellij-live-agents-in-session $session
    match $action {
        "latest-idle" => {
            let idle_agents = pi-zellij-live-agents | where state == "idle" | sort-by idleAt --reverse
            if ($idle_agents | is-not-empty) {
                let agent = $idle_agents | first
                pi-zellij-focus-agent $agent.zellijSession $agent
                if $agent.zellijSession != $session {
                    pi-zellij-switch-session $agent.zellijSession
                }
            }
        }
        "next" => { pi-zellij-cycle-agent $session $agents 1 }
        "previous" => { pi-zellij-cycle-agent $session $agents (-1) }
        "list" => {
            $agents | each { |agent| {
                state: $agent.state
                title: ($agent.title | default "(untitled)")
                pane: $agent.paneId
                cwd: $agent.cwd
                idle_at: (if ($agent.idleAt | is-empty) { null } else { $agent.idleAt * 1_000_000 | into datetime })
            } }
        }
        _ => { error make { msg: $"unknown za action: ($action)" } }
    }
}
