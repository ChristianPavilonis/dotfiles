# tech-debt-analysis

Weekly YesMan plugin that asks Pi to inspect a random source file in a
configured repository, find exactly one actionable tech-debt/refactor
opportunity, and open a GitHub issue.

## Behavior

- Schedule: `0 9 * * 1` — Mondays at 9:00 AM local time.
- Handles `tech-debt-analysis.run`.
- Selects one random tracked source file from the repo using `git ls-files`.
- If a repo config sets `include_paths`, only files under those paths are
  eligible as the random starting file.
- Filters out build output, vendor/dependency directories, lockfiles, generated
  files, media/binary-like files, and files larger than `max_file_bytes`.
- Runs Pi from the repository cwd.
- Pi must:
  - start from the selected file,
  - inspect related code only as needed,
  - find exactly one actionable issue/refactor,
  - avoid code changes and PRs,
  - open exactly one GitHub issue with `gh issue create`,
  - finish with a `TECH_DEBT_RESULT` marker.
- The plugin verifies the reported issue with `gh issue view`.
- Idempotency: one completed issue per repo per ISO week unless `force` is set.

## Config

```toml
[config]
enabled = true
harness_name = "pi"
thinking = "high"
max_repos_per_run = 1
issue_label = "tech-debt"
agent_timeout_minutes = 120
max_file_bytes = 250000
agent_tools = ["read", "bash", "ffgrep", "fffind"]

[[config.repositories]]
name = "rigzilla"
cwd = "/home/christian/projects/rigzilla"
repo = "ChristianPavilonis/rigzilla"
enabled = true
include_paths = [
  "app",
  "database",
  "resources",
  "routes",
  "src-tauri/src",
  "tests",
]
```

Leave `include_paths` empty or omit it to allow any tracked source file that
passes the global filters.

## Manual run

```bash
yesman emit tech-debt-analysis.run '{"reason":"manual"}'
```

Force a rerun for the current week:

```bash
yesman emit tech-debt-analysis.run '{"reason":"manual","force":true}'
```

Limit to a configured repo name or `OWNER/REPO` value:

```bash
yesman emit tech-debt-analysis.run '{"reason":"manual","repos":["rigzilla"],"force":true}'
```

Override the week key for testing:

```bash
yesman emit tech-debt-analysis.run '{"reason":"manual","week":"2026-W24","force":true}'
```

## Events

- `tech-debt-analysis.run.started`
- `tech-debt-analysis.repo.started`
- `tech-debt-analysis.repo.skipped`
- `tech-debt-analysis.repo.completed`
- `tech-debt-analysis.repo.failed`
- `tech-debt-analysis.run.completed`
