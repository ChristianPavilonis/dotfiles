# Best-effort snapshot. Another process can enter a worktree after this runs.
def git-worktree-active-cwds [] {
  glob "/proc/*/cwd" --no-dir
  | each { |link|
      let result = (do { ^readlink -f ($link | into string) } | complete)
      if $result.exit_code == 0 {
        $result.stdout | str trim
      }
    }
  | where { |path| $path | is-not-empty }
  | uniq
}

def git-worktree-path-is-active [path: string, active_cwds: list<string>] {
  $active_cwds | any { |cwd|
    $cwd == $path or ($cwd | str starts-with $"($path)/")
  }
}

def git-worktree-operation-in-progress [path: string] {
  [MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply BISECT_LOG]
  | any { |name|
      let result = (do { ^git -C $path rev-parse --git-path $name } | complete)
      $result.exit_code == 0 and ($result.stdout | str trim | path exists)
    }
}

def git-worktree-github-slug [remote: string] {
  if not ($remote | str contains "github.com") {
    return null
  }

  let slug = (
    $remote
    | str replace --regex '^git@github\.com:' ''
    | str replace --regex '^https?://github\.com/' ''
    | str replace --regex '^ssh://git@github\.com/' ''
    | str replace --regex '\.git$' ''
    | str trim --char '/'
  )

  if $slug =~ '^[^/]+/[^/]+$' { $slug } else { null }
}

def git-worktree-main-ref [common_dir: string] {
  for ref in [refs/remotes/origin/main refs/remotes/origin/master refs/heads/main refs/heads/master] {
    if (do { ^git --git-dir $common_dir rev-parse --verify --quiet $ref } | complete).exit_code == 0 {
      return $ref
    }
  }

  null
}

def git-worktree-details [path_value, active_cwds: list<string>, now_seconds: int] {
  let path = ($path_value | into string)
  let check = (do { ^git -C $path rev-parse --is-inside-work-tree } | complete)
  if $check.exit_code != 0 {
    return null
  }

  let branch = (^git -C $path branch --show-current | str trim)
  let head = (^git -C $path rev-parse HEAD | str trim)
  let common_dir = (^git -C $path rev-parse --path-format=absolute --git-common-dir | str trim)
  let remote_result = (do { ^git -C $path config --get remote.origin.url } | complete)
  let remote = if $remote_result.exit_code == 0 { $remote_result.stdout | str trim } else { "" }
  let slug = (git-worktree-github-slug $remote)
  let status = (^git -C $path status --porcelain --untracked-files=all --ignored=matching | lines)
  let ignored = ($status | where { |line| $line | str starts-with "!!" })
  let changes = ($status | where { |line| not ($line | str starts-with "!!") })
  let commit_seconds = (^git -C $path log -1 --format=%ct | str trim | into int)
  let size_result = (do { ^du -sk $path } | complete)
  let size_bytes = if $size_result.exit_code == 0 {
    ($size_result.stdout | str trim | split row --regex '\s+' | first | into int) * 1024
  } else {
    0
  }

  {
    path: $path
    repo: (if $slug == null { $common_dir | path dirname | path basename } else { $slug })
    slug: $slug
    branch: $branch
    head: $head
    common_dir: $common_dir
    clean: ($changes | is-empty)
    has_ignored: ($ignored | is-not-empty)
    active: (git-worktree-path-is-active $path $active_cwds)
    operation_in_progress: (git-worktree-operation-in-progress $path)
    age_seconds: ($now_seconds - $commit_seconds)
    size_bytes: $size_bytes
  }
}

# Clean merged or stale, pushed worktrees under ~/worktrees.
def gwc [
  --older-than: duration = 30day # age required for an unmerged, pushed worktree
  --merged                       # only offer merged worktrees
  --include-ignored              # allow removal of ignored local files and build output
  --dry-run(-n)                  # print removal candidates without removing anything
] {
  if $nu.os-info.name != "linux" {
    error make { msg: "gwc currently supports Linux only because active-worktree detection requires /proc" }
  }

  let worktree_root = ($env.HOME | path join "worktrees")
  if not ($worktree_root | path exists) {
    print $"No worktree directory found at ($worktree_root)."
    return
  }

  let older_than_seconds = (($older_than | into int) / 1_000_000_000 | math round)
  let now_seconds = (date now | format date "%s" | into int)
  let active_cwds = (git-worktree-active-cwds)
  let worktrees = (
    glob ($worktree_root | path join "*")
    | where { |path| ($path | path type) == "dir" }
    | each { |path| git-worktree-details $path $active_cwds $now_seconds }
    | compact
  )

  if ($worktrees | is-empty) {
    print $"No Git worktrees found under ($worktree_root)."
    return
  }

  let assessed = (
    $worktrees
    | group-by common_dir
    | transpose common_dir items
    | each { |group|
        let sample = ($group.items | first)
        print $"Checking ($sample.repo)..."

        let fetch_result = (do { ^git --git-dir $group.common_dir fetch --all --prune --quiet } | complete)
        if $fetch_result.exit_code != 0 {
          print $"Warning: fetch failed for ($sample.repo); stale remote data will not be used."
        }
        let fetch_ok = ($fetch_result.exit_code == 0)

        let merged_prs = if $sample.slug != null and (which gh | is-not-empty) {
          let gh_result = (do {
            ^gh pr list --repo $sample.slug --state merged --limit 1000 --json headRefName,headRefOid
          } | complete)
          if $gh_result.exit_code == 0 {
            try { $gh_result.stdout | from json } catch { [] }
          } else {
            print $"Warning: GitHub PR lookup failed for ($sample.repo); using Git merge detection only."
            []
          }
        } else {
          []
        }

        let main_ref = if $fetch_ok {
          git-worktree-main-ref $group.common_dir
        } else {
          null
        }

        $group.items | each { |wt|
          let remote_branches = if $fetch_ok {
            do {
              ^git --git-dir $wt.common_dir branch -r --contains $wt.head '--format=%(refname:short)'
            } | complete
          } else {
            { stdout: "", stderr: "", exit_code: 1 }
          }
          let pushed = ($remote_branches.exit_code == 0 and ($remote_branches.stdout | str trim | is-not-empty))
          let merged_by_git = if $main_ref == null {
            false
          } else {
            (do { ^git --git-dir $wt.common_dir merge-base --is-ancestor $wt.head $main_ref } | complete).exit_code == 0
          }
          let merged_by_pr = (
            $merged_prs | any { |pr|
              $pr.headRefName == $wt.branch and $pr.headRefOid == $wt.head
            }
          )
          let is_merged = ($merged_by_git or $merged_by_pr)
          let is_stale_pushed = ($fetch_ok and $pushed and $wt.age_seconds >= $older_than_seconds)
          let safe = (
            $wt.branch != ""
            and $wt.clean
            and ($include_ignored or not $wt.has_ignored)
            and not $wt.active
            and not $wt.operation_in_progress
            and ($is_merged or ($is_stale_pushed and not $merged))
          )
          let reason = if $merged_by_pr {
            "merged PR"
          } else if $merged_by_git {
            "merged into main"
          } else if $is_stale_pushed {
            "stale and pushed"
          } else {
            "protected"
          }

          $wt | merge {
            pushed: $pushed
            is_merged: $is_merged
            safe: $safe
            reason: $reason
          }
        }
      }
    | flatten
  )

  let candidates = ($assessed | where safe | sort-by size_bytes --reverse)
  let dirty_count = ($assessed | where { |wt| not $wt.clean } | length)
  let ignored_count = ($assessed | where has_ignored | length)
  let active_count = ($assessed | where active | length)
  let operation_count = ($assessed | where operation_in_progress | length)

  let candidate_count = ($candidates | length)
  let candidate_noun = if $candidate_count == 1 { "candidate" } else { "candidates" }
  print $"Found ($candidate_count) removal ($candidate_noun). Skipped ($dirty_count) dirty, ($ignored_count) with ignored files, ($active_count) active when scanned, and ($operation_count) mid-operation worktrees."

  if ($candidates | is-empty) {
    if $ignored_count > 0 and not $include_ignored {
      print "Use gwc --include-ignored to review candidates that contain ignored files or build output."
    }
    return
  }

  if $dry_run {
    return ($candidates | each { |wt|
      {
        repo: $wt.repo
        branch: $wt.branch
        reason: $wt.reason
        ignored: $wt.has_ignored
        age: $"((($wt.age_seconds / 86400) | math floor))d"
        size: ($wt.size_bytes | into filesize)
        path: $wt.path
      }
    })
  }

  if (which fzf | is-empty) {
    error make { msg: "gwc requires fzf unless --dry-run is used" }
  }

  let menu = (
    $candidates
    | each { |wt|
        let age_days = (($wt.age_seconds / 86400) | math floor)
        let ignored = if $wt.has_ignored { "ignored files" } else { "no ignored files" }
        $"($wt.path)\t($wt.repo)\t($wt.branch)\t($wt.reason)\t($ignored)\t($age_days)d\t($wt.size_bytes | into filesize)"
      }
    | str join (char newline)
  )
  let selection = (do {
    $menu | ^fzf --multi --height=60% --header="Select worktrees to remove. Close shells using them first; active-process detection is best effort." --delimiter="\t" --with-nth=2..
  } | complete)

  if $selection.exit_code != 0 or ($selection.stdout | str trim | is-empty) {
    print "Nothing selected."
    return
  }

  let selected_paths = (
    $selection.stdout
    | lines
    | each { |line| $line | split row "\t" | first }
  )
  let selected = ($candidates | where { |wt| $wt.path in $selected_paths })
  let selected_size = ($selected | get size_bytes | math sum | into filesize)
  let selected_with_ignored = ($selected | where has_ignored | length)
  let ignored_warning = if $selected_with_ignored > 0 {
    $" This will delete ignored files in ($selected_with_ignored) selected worktrees."
  } else {
    ""
  }
  let answer = (input $"Remove ($selected | length) worktrees and reclaim about ($selected_size)? Local branches will be kept.($ignored_warning) [y/N] ")
  if ($answer | str lowercase) not-in [y yes] {
    print "Cancelled."
    return
  }

  mut removed = 0
  mut common_dirs = []
  for wt in $selected {
    let current_active_cwds = (git-worktree-active-cwds)
    let current_status = (do { ^git -C $wt.path status --porcelain --untracked-files=all --ignored=matching } | complete)
    let current_status_lines = ($current_status.stdout | lines)
    let current_changes = ($current_status_lines | where { |line| not ($line | str starts-with "!!") })
    let current_ignored = ($current_status_lines | where { |line| $line | str starts-with "!!" })
    let current_head = (do { ^git -C $wt.path rev-parse HEAD } | complete)
    let changed = (
      $current_status.exit_code != 0
      or ($current_changes | is-not-empty)
      or (not $include_ignored and ($current_ignored | is-not-empty))
      or $current_head.exit_code != 0
      or ($current_head.stdout | str trim) != $wt.head
      or (git-worktree-path-is-active $wt.path $current_active_cwds)
      or (git-worktree-operation-in-progress $wt.path)
    )

    if $changed {
      print $"Skipping ($wt.path): its safety state changed after selection."
      continue
    }

    print $"Removing ($wt.branch) at ($wt.path)..."
    let remove_result = (do { ^git --git-dir $wt.common_dir worktree remove $wt.path } | complete)
    if $remove_result.exit_code == 0 {
      $removed += 1
      $common_dirs = ($common_dirs | append $wt.common_dir | uniq)
    } else {
      print $"Could not remove ($wt.path): ($remove_result.stderr | str trim)"
    }
  }

  for common_dir in $common_dirs {
    do { ^git --git-dir $common_dir worktree prune } | complete | ignore
  }

  print $"Removed ($removed) worktrees. Local branches were kept."
}
