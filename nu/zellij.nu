# Zellij Sessionizer

const ZELLIJ_SWITCH_PLUGIN = "https://github.com/mostafaqanbaryan/zellij-switch/releases/download/0.2.1/zellij-switch.wasm"
const SCRIPT_DIR = (path self | path dirname)

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
        [$"($env.HOME)/.dotfiles", $"($env.HOME)/.dotfiles/.config/nvim"]
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
        | each { |dir| { atime: (^stat -f "%a" $dir | str trim | into int), path: $dir } }
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
                        $" (ansi green)\(current\)(ansi reset)"
                    } else if ($line | str contains "(EXITED") {
                        $" (ansi red)\(exited\)(ansi reset)"
                    } else {
                        $" (ansi yellow)\(active\)(ansi reset)"
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
        zellij pipe --plugin $switch_plugin -- $"--session ($session_name) --cwd ($selected_dir)"
    } else {
        zellij attach $session_name --create options --default-cwd $selected_dir
    }
}
