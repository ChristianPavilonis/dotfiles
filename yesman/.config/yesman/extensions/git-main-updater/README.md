# Git Main Updater extension

A standalone `yesman.extension/1` replacement for the legacy `plugins/git-main-updater` SDK plugin. It schedules one durable YesMan conversation each day; the host agent performs the Git operations under the configured workspace's authorization.

## Behavior and safety boundary

- Polls locally and dispatches after the configured daily time because protocol v1 has no scheduler capability.
- Uses a stable request ID derived from the workspace and local date, so YesMan's durable receipt prevents duplicate daily work across extension restarts.
- Is inert until `enabled`, `workspace_id`, and the extension's YesMan workspace authorization are all configured.
- The generated task considers only non-hidden, direct-child Git worktrees under `projects_root`.
- For every repository with `origin`, it prunes the remote, then updates configured branches:
  - a checked-out clean branch uses `git pull --ff-only origin <branch>`;
  - a non-checked-out branch uses the non-forced refspec `git fetch origin <branch>:<branch>`;
  - a dirty checked-out branch, missing branch, missing `origin`, or failed command is recorded and skipped or reported.
- The task explicitly prohibits switching branches, merge/rebase/reset/stash, commits, pushes, remote changes, and project-file modifications.

The extension itself does not run Git or read project files. It only asks the host agent to perform the bounded update, so the workspace's normal authorization remains the enforcement point.

## Configuration

Set a durable YesMan workspace UUIDv7, then enable the extension through YesMan's ordinary extension controls:

```toml
[config]
enabled = true
workspace_id = "the durable UUIDv7 of the YesMan workspace"
projects_root = "/Users/christian/projects"
branches = ["main", "master"]
time_zone = "America/Chicago"
daily_hour = 6
daily_minute = 30
poll_interval_seconds = 900
```

`projects_root` must be an absolute path. Branches are limited to conservative Git branch-name syntax so they can be safely inserted into the generated task. The default 06:30 schedule is evaluated in `time_zone`, not the server timezone.

Do not enable this extension and the legacy `plugins/git-main-updater` plugin at the same time.

## Validation

```bash
cd ~/dotfiles/yesman/.config/yesman/extensions/git-main-updater
deno fmt --check main.ts main.test.ts main.protocol.test.ts
deno test --allow-env --allow-run main.test.ts main.protocol.test.ts
deno check main.ts
```
