# yesman-agent-tasks

Scheduled YesMan plugin that turns `@yesman ...` directives in Obsidian task notes into Pi harness runs.

## Behavior

- Registers a minutely scan schedule: `* * * * *`.
- Registers a monitor schedule: `*/10 * * * *`.
- Scans `/home/christian/Documents/MyObsidianVault` for Markdown notes with:
  - `type: task`
  - `status: open`
  - a line containing `@yesman`
- Treats the line containing `@yesman` as the directive and the whole note as context.
- Claims at most one new task per scan by default.
- On claim:
  - sets note frontmatter to `status: active`
  - removes the `@yesman` directive line from the visible note body
  - stores the directive in YesMan KV/logs and in a managed metadata block
- If the note project has a configured repo, creates a branch/worktree from the repo's `origin/HEAD` default branch and starts the agent in that worktree.
- If the note project has no configured repo, starts the agent from the vault and lets it research/plan/edit the note directly.
- The agent decides what the directive requires: research, note edits, planning, code work, a PR, or some combination.
- The agent may edit the task note directly, but should not edit the `yesman-agent` managed metadata block.
- If code changes are made, the agent is instructed to commit, push, and open a draft GitHub PR.
- Keeps successful notes at `status: active` whether the run opened a PR or only edited the note.
- Sets the note to `status: blocked` when the run fails, times out, is cancelled, or is interrupted.

Managed metadata block:

```markdown
<!-- yesman-agent:start -->
Status: active
Task ID: ...
Directive: research this and add your findings
Branch: yesman/...
Worktree: /home/christian/worktrees/...
Run: ...
<!-- yesman-agent:end -->
```

## Runtime permissions

This plugin declares its required Deno permissions in `plugin.toml`:

```toml
[permissions]
read = [
  "/home/christian/Documents/MyObsidianVault",
  "/home/christian/projects",
  "/home/christian/worktrees",
]
write = ["/home/christian/Documents/MyObsidianVault"]
run = ["git"]
```

## Manual commands

Trigger a scan now:

```bash
yesman emit yesman-agent-tasks.scan '{}'
```

Dry-run scan without mutating notes, creating worktrees, or starting agents:

```bash
yesman emit yesman-agent-tasks.scan '{"dryRun":true}'
```

Run one specific note:

```bash
yesman emit yesman-agent-tasks.run-one '{"notePath":"/home/christian/Documents/MyObsidianVault/Notes/Some Task.md"}'
```

Monitor active runs now:

```bash
yesman emit yesman-agent-tasks.monitor '{}'
```

Reset a task after inspection:

```bash
yesman emit yesman-agent-tasks.reset '{"taskId":"..."}'
```

Cleanup dry-run:

```bash
yesman emit yesman-agent-tasks.cleanup '{"taskId":"..."}'
```

Remove a terminal task's worktree:

```bash
yesman emit yesman-agent-tasks.cleanup '{"taskId":"...","removeWorktree":true}'
```

## Optional config

```bash
yesman config set yesman-agent-tasks enabled true
yesman config set yesman-agent-tasks dry_run false
yesman config set yesman-agent-tasks vault_path '"/home/christian/Documents/MyObsidianVault"'
yesman config set yesman-agent-tasks worktree_root '"/home/christian/worktrees"'
yesman config set yesman-agent-tasks max_new_per_scan 1
yesman config set yesman-agent-tasks max_concurrency 1
yesman config set yesman-agent-tasks agent_timeout_minutes 90
yesman config set yesman-agent-tasks project_repos '{"rigzilla":"/home/christian/projects/rigzilla","scrapezilla":"/home/christian/projects/scrapezilla","trusted-server":"/home/christian/projects/trusted-server","yesman":"/home/christian/projects/yesman"}'
```
