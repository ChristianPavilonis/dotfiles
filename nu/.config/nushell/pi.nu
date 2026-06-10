# Pi helpers

const PI_WORKLOG_DIR = ("~/.pi/agent/logs" | path expand)

# Launch pi in plan mode to address PR review comments
# Requires the @ifi/pi-plan extension package.
def picrc [] {
  pi "/plan" "Look at the current PR's review comments using gh CLI commands. Identify any requested changes or actionable review feedback. Create a plan to address each valid comment, organized by file and priority."
}

# Launch pi with the Trusted Server review prompt for the current branch's PR.
def pipr [] {
  pi "/ts-review" "current branch's PR"
}

def _worklog-default-date [] {
  date now | format date "%Y-%m-%d"
}

def _worklog-resolve-date [date?: string] {
  if $date == null {
    _worklog-default-date
  } else {
    $date
  }
}

def _worklog-log-file [date?: string] {
  let resolved_date = (_worklog-resolve-date $date)
  $PI_WORKLOG_DIR | path join $"($resolved_date).jsonl"
}

def _worklog-get [row, key: string] {
  if ($key in ($row | columns)) {
    $row | get $key
  } else {
    null
  }
}

def _worklog-string [value] {
  if $value == null {
    ""
  } else {
    $value | into string
  }
}

def _worklog-lower [value] {
  _worklog-string $value | str downcase
}

def _worklog-has-text [value] {
  ((_worklog-string $value | str trim | str length) > 0)
}

def _worklog-matches-filter [value, filter] {
  if $filter == null {
    true
  } else {
    (_worklog-lower $value | str contains (_worklog-lower $filter))
  }
}

def _worklog-repo-name-from-path [git_repo] {
  if not (_worklog-has-text $git_repo) {
    null
  } else {
    let trimmed = (_worklog-string $git_repo | str trim | str replace --regex '[\\/]+$' '')
    if ($trimmed | str length) == 0 {
      null
    } else {
      $trimmed | path basename
    }
  }
}

def _worklog-resolve-repo-from-cwd [cwd] {
  if not (_worklog-has-text $cwd) {
    { gitRepo: null, repoName: null }
  } else {
    let expanded_cwd = (_worklog-string $cwd | path expand)
    if not ($expanded_cwd | path exists) {
      { gitRepo: null, repoName: null }
    } else {
      let probe = (^git -C $expanded_cwd rev-parse --path-format=absolute --git-common-dir | complete)
      if $probe.exit_code != 0 {
        { gitRepo: null, repoName: null }
      } else {
        let git_common_dir = ($probe.stdout | str trim)
        let git_repo = if ($git_common_dir | path basename) == ".git" {
          $git_common_dir | path dirname
        } else {
          $git_common_dir
        }
        { gitRepo: $git_repo, repoName: (_worklog-repo-name-from-path $git_repo) }
      }
    }
  }
}

def _worklog-enrich-record [row] {
  let cwd = (_worklog-get $row "cwd")
  let current_git_repo = (_worklog-get $row "gitRepo")
  let current_repo_name = (_worklog-get $row "repoName")
  let resolved_repo = if (_worklog-has-text $current_git_repo) or (_worklog-has-text $current_repo_name) {
    {
      gitRepo: (if (_worklog-has-text $current_git_repo) { $current_git_repo } else { null })
      repoName: (if (_worklog-has-text $current_repo_name) { $current_repo_name } else { (_worklog-repo-name-from-path $current_git_repo) })
    }
  } else {
    _worklog-resolve-repo-from-cwd $cwd
  }

  $row
  | upsert gitRepo $resolved_repo.gitRepo
  | upsert repoName $resolved_repo.repoName
  | upsert text (_worklog-get $row "text")
  | upsert gitBranch (_worklog-get $row "gitBranch")
  | upsert source (_worklog-get $row "source")
}

def _worklog-read-day [date?: string] {
  let file_path = (_worklog-log-file $date)
  if not ($file_path | path exists) {
    []
  } else {
    open $file_path --raw
    | lines
    | where { |line| (($line | str trim | str length) > 0) }
    | each { |line| $line | from json }
    | each { |row| _worklog-enrich-record $row }
    | sort-by epochMs
  }
}

def _worklog-filter-records [records, --repo(-r): string, --branch(-b): string, --cwd(-c): string, --source(-s): string] {
  $records | where { |row|
    let repo_matches = if $repo == null {
      true
    } else {
      (_worklog-matches-filter $row.repoName $repo) or (_worklog-matches-filter $row.gitRepo $repo)
    }

    ($repo_matches
      and (_worklog-matches-filter $row.gitBranch $branch)
      and (_worklog-matches-filter $row.cwd $cwd)
      and (_worklog-matches-filter $row.source $source))
  }
}

def _worklog-round-2 [value] {
  (($value * 100) | math round) / 100
}

def _worklog-text-preview [text, max_len: int = 140] {
  let value = (_worklog-string $text | str trim)
  if ($value | str length) <= $max_len {
    $value
  } else {
    $"(($value | str substring 0..($max_len - 2)))…"
  }
}

def _worklog-unique-values [rows, field: string] {
  $rows
  | get $field
  | where { |value| _worklog-has-text $value }
  | uniq
  | sort
}

def _worklog-command-token [text] {
  let first_line = (_worklog-string $text | lines | first)
  if ($first_line | str starts-with "/") {
    $first_line | split row " " | first
  } else {
    null
  }
}

def _worklog-count-by [records, field: string, label: string = "value"] {
  $records
  | where { |row| _worklog-has-text (_worklog-get $row $field) }
  | group-by { |row| _worklog-get $row $field }
  | transpose $label rows
  | each { |entry| {
      $label: ($entry | get $label)
      count: ($entry.rows | length)
    }
  }
  | sort-by count -r
}

def _worklog-command-usage [records] {
  $records
  | each { |row| { command: (_worklog-command-token $row.text) } }
  | where { |row| _worklog-has-text $row.command }
  | group-by command
  | transpose command rows
  | each { |entry| {
      command: $entry.command
      count: ($entry.rows | length)
    }
  }
  | sort-by count -r
}

def _worklog-timeline-preview [row] {
  if (_worklog-has-text $row.text) {
    _worklog-text-preview $row.text
  } else if (($row.type | default null) == "session_start") {
    $"session started (($row.reason | default "unknown"))"
  } else if (($row.type | default null) == "agent_end") {
    let duration_ms = ($row.durationMs | default null)
    let message_count = ($row.messageCount | default null)
    if $duration_ms == null and $message_count == null {
      "agent turn finished"
    } else if $duration_ms == null {
      $"agent turn finished ($message_count) messages"
    } else {
      let seconds = (_worklog-round-2 (($duration_ms | into float) / 1000))
      if $message_count == null {
        $"agent turn finished ($seconds)s"
      } else {
        $"agent turn finished ($seconds)s, ($message_count) messages"
      }
    }
  } else {
    (_worklog-string ($row.type | default "event") | str replace '_' ' ')
  }
}

def _worklog-build_timeline_row [row] {
  {
    type: ($row.type | default null)
    timestamp: $row.timestamp
    time: ((($row.timestamp | into datetime) | format date "%H:%M") | default null)
    repoName: $row.repoName
    gitBranch: $row.gitBranch
    cwd: $row.cwd
    source: $row.source
    text: $row.text
    preview: (_worklog-timeline-preview $row)
  }
}

def _worklog-build-timeline [records] {
  $records | each { |row| _worklog-build_timeline_row $row }
}

def _worklog-top-prompts [records, limit: int = 10] {
  $records
  | where { |row| _worklog-has-text $row.text }
  | group-by text
  | transpose text rows
  | each { |entry| {
      text: $entry.text
      preview: (_worklog-text-preview $entry.text)
      count: ($entry.rows | length)
    }
  }
  | sort-by count -r
  | first $limit
}

def _worklog-new-session [row] {
  {
    start: $row.timestamp
    end: $row.timestamp
    startEpochMs: $row.epochMs
    endEpochMs: $row.epochMs
    eventCount: 1
    events: [$row]
    gapsMs: []
  }
}

def _worklog-extend-session [session, row, gap_ms: int] {
  {
    start: $session.start
    end: $row.timestamp
    startEpochMs: $session.startEpochMs
    endEpochMs: $row.epochMs
    eventCount: ($session.eventCount + 1)
    events: ($session.events | append $row)
    gapsMs: ($session.gapsMs | append $gap_ms)
  }
}

def _worklog-finalize-session [session, min_session_minutes: int, active_gap_minutes: int] {
  let raw_span_minutes = (($session.endEpochMs - $session.startEpochMs) / 60000)
  let active_gap_ms = ($active_gap_minutes * 60 * 1000)
  let clipped_gap_ms = if (($session.gapsMs | length) == 0) {
    0
  } else {
    $session.gapsMs
    | each { |gap| if $gap > $active_gap_ms { $active_gap_ms } else { $gap } }
    | math sum
  }
  let estimated_from_gaps = ($clipped_gap_ms / 60000)
  let estimated_minutes = if $estimated_from_gaps < $min_session_minutes {
    $min_session_minutes
  } else {
    $estimated_from_gaps
  }

  {
    start: $session.start
    end: $session.end
    startEpochMs: $session.startEpochMs
    endEpochMs: $session.endEpochMs
    startTime: (($session.start | into datetime) | format date "%H:%M")
    endTime: (($session.end | into datetime) | format date "%H:%M")
    rawSpanMinutes: (_worklog-round-2 $raw_span_minutes)
    estimatedMinutes: (_worklog-round-2 $estimated_minutes)
    eventCount: $session.eventCount
    repoNames: (_worklog-unique-values $session.events "repoName")
    branches: (_worklog-unique-values $session.events "gitBranch")
    cwds: (_worklog-unique-values $session.events "cwd")
    firstPrompts: ($session.events | where { |event| _worklog-has-text $event.text } | each { |event| _worklog-text-preview $event.text } | first 3)
  }
}

def _worklog-build-sessions [records, gap_minutes: int = 30, min_session_minutes: int = 5, active_gap_minutes: int = 15] {
  let sorted = ($records | sort-by epochMs)
  if (($sorted | length) == 0) {
    []
  } else {
    let gap_threshold_ms = ($gap_minutes * 60 * 1000)
    let seeded = {
      sessions: []
      current: (_worklog-new-session ($sorted | first))
    }

    let reduced = (
      $sorted
      | skip 1
      | reduce -f $seeded { |row, acc|
          let gap_ms = ($row.epochMs - $acc.current.endEpochMs)
          if $gap_ms <= $gap_threshold_ms {
            $acc | upsert current (_worklog-extend-session $acc.current $row $gap_ms)
          } else {
            {
              sessions: ($acc.sessions | append (_worklog-finalize-session $acc.current $min_session_minutes $active_gap_minutes))
              current: (_worklog-new-session $row)
            }
          }
        }
    )

    $reduced.sessions | append (_worklog-finalize-session $reduced.current $min_session_minutes $active_gap_minutes)
  }
}

def worklog [] {
  print "Pi worklog commands:"
  print "  worklog path [date]"
  print "  worklog day [date] [--repo --branch --cwd --source]"
  print "  worklog sessions [date] [--repo --branch --cwd --source --gap-minutes --active-gap-minutes --min-session-minutes]"
  print "  worklog estimate [date] [--repo --branch --cwd --source --gap-minutes --active-gap-minutes --min-session-minutes]"
  print "  worklog report-context [date] [--repo --branch --cwd --source --gap-minutes --active-gap-minutes --min-session-minutes --question]"
  print ""
  print "Examples:"
  print "  worklog day 2026-04-23 --repo trusted-server"
  print "  worklog estimate 2026-04-23 --repo trusted-server"
  print "  worklog report-context 2026-04-23 --repo trusted-server --question \"Estimate hours and summarize work\" | to json"
}

def "worklog path" [date?: string] {
  _worklog-log-file $date
}

def "worklog day" [date?: string, --repo(-r): string, --branch(-b): string, --cwd(-c): string, --source(-s): string] {
  let records = (_worklog-read-day $date)
  _worklog-filter-records $records --repo $repo --branch $branch --cwd $cwd --source $source
}

def "worklog sessions" [date?: string, --repo(-r): string, --branch(-b): string, --cwd(-c): string, --source(-s): string, --gap-minutes(-g): int = 30, --active-gap-minutes(-a): int = 15, --min-session-minutes(-m): int = 5] {
  let records = (worklog day $date --repo $repo --branch $branch --cwd $cwd --source $source)
  _worklog-build-sessions $records $gap_minutes $min_session_minutes $active_gap_minutes
}

def "worklog estimate" [date?: string, --repo(-r): string, --branch(-b): string, --cwd(-c): string, --source(-s): string, --gap-minutes(-g): int = 30, --active-gap-minutes(-a): int = 15, --min-session-minutes(-m): int = 5] {
  let records = (worklog day $date --repo $repo --branch $branch --cwd $cwd --source $source)
  let sessions = (_worklog-build-sessions $records $gap_minutes $min_session_minutes $active_gap_minutes)
  let estimated_minutes = if (($sessions | length) == 0) { 0 } else { $sessions | get estimatedMinutes | math sum }
  let raw_span_minutes = if (($sessions | length) == 0) { 0 } else { $sessions | get rawSpanMinutes | math sum }

  {
    date: (_worklog-resolve-date $date)
    filters: {
      repo: $repo
      branch: $branch
      cwd: $cwd
      source: $source
    }
    heuristics: {
      sessionGapMinutes: $gap_minutes
      activeGapMinutes: $active_gap_minutes
      minSessionMinutes: $min_session_minutes
    }
    totals: {
      events: ($records | length)
      sessions: ($sessions | length)
      rawSpanMinutes: (_worklog-round-2 $raw_span_minutes)
      estimatedMinutes: (_worklog-round-2 $estimated_minutes)
      estimatedHours: (_worklog-round-2 ($estimated_minutes / 60))
    }
  }
}

def "worklog report-context" [date?: string, --repo(-r): string, --branch(-b): string, --cwd(-c): string, --source(-s): string, --gap-minutes(-g): int = 30, --active-gap-minutes(-a): int = 15, --min-session-minutes(-m): int = 5, --question(-q): string] {
  let resolved_date = (_worklog-resolve-date $date)
  let records = (worklog day $resolved_date --repo $repo --branch $branch --cwd $cwd --source $source)
  let sessions = (_worklog-build-sessions $records $gap_minutes $min_session_minutes $active_gap_minutes)
  let estimated_minutes = if (($sessions | length) == 0) { 0 } else { $sessions | get estimatedMinutes | math sum }
  let raw_span_minutes = if (($sessions | length) == 0) { 0 } else { $sessions | get rawSpanMinutes | math sum }
  let unresolved_repo_count = ($records | where { |row| not (_worklog-has-text $row.repoName) } | length)

  {
    date: $resolved_date
    question: $question
    filters: {
      repo: $repo
      branch: $branch
      cwd: $cwd
      source: $source
    }
    heuristics: {
      sessionGapMinutes: $gap_minutes
      activeGapMinutes: $active_gap_minutes
      minSessionMinutes: $min_session_minutes
      estimateMethod: "sessions are split when gaps exceed sessionGapMinutes; gaps inside a session contribute up to activeGapMinutes each; every session has at least minSessionMinutes"
    }
    totals: {
      events: ($records | length)
      sessions: ($sessions | length)
      rawSpanMinutes: (_worklog-round-2 $raw_span_minutes)
      estimatedMinutes: (_worklog-round-2 $estimated_minutes)
      estimatedHours: (_worklog-round-2 ($estimated_minutes / 60))
    }
    types: (_worklog-count-by $records "type" "type")
    repos: (_worklog-count-by $records "repoName" "repoName")
    gitRepos: (_worklog-count-by $records "gitRepo" "gitRepo")
    branches: (_worklog-count-by $records "gitBranch" "gitBranch")
    cwds: (_worklog-count-by $records "cwd" "cwd")
    commands: (_worklog-command-usage $records)
    topPrompts: (_worklog-top-prompts $records 12)
    sessions: $sessions
    timeline: (_worklog-build-timeline $records)
    notes: ([
      (if $repo == null { null } else { "repo filters match both repoName and gitRepo" })
      (if $unresolved_repo_count == 0 { null } else { $"($unresolved_repo_count) records are missing repo metadata even after cwd-based enrichment" })
      "This is a rough estimate of Pi-tracked interactive work, not a full timesheet of all coding time."
    ] | compact)
  }
}
