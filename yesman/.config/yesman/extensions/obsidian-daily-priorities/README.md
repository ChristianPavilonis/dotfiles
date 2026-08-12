# Obsidian Daily Priorities extension

A `yesman.extension/1` replacement for the legacy `plugins/obsidian-daily-priorities` SDK plugin. It schedules a single durable YesMan conversation each day; the host agent updates the managed priorities block in Christian's daily Obsidian note.

## Safety boundary

The extension is disabled by default and has no workspace configured. It inherits `PATH` solely so its launcher can find Deno; the extension itself has no filesystem permission. Once explicitly configured and enabled:

1. It checks the configured time zone at the configured daily hour (7:00 AM America/Chicago by default).
2. It sends `conversations.create` with a request ID derived from the authorized workspace and local date.
3. YesMan's package-scoped durable receipt makes restarts and lost responses safe: the same date can create at most one conversation/run.
4. The host agent, using workspace-owned model/tool/instruction policy, reads and updates the vault. The extension has no filesystem permission and never edits vault files itself.

It intentionally has no legacy `yesman emit obsidian.daily-priorities.update` equivalent: protocol v1 does not provide extension-owned schedules or arbitrary host event registration. To run it early, temporarily set `daily_hour` to the current or an earlier hour and restart/enable the extension. The durable receipt prevents a second run for that date.

## Configuration

Configure a YesMan workspace, obtain its UUIDv7 ID, then replace the commented value in `extension.toml`:

```toml
[config]
enabled = true
workspace_id = "the durable UUIDv7 of the YesMan workspace"
vault_path = "/Users/christian/Documents/MyObsidianVault"
daily_folder = "daily"
time_zone = "America/Chicago"
daily_hour = 7
poll_interval_seconds = 900
max_tasks = 12
```

`vault_path` must be absolute; `daily_folder` must be a relative, traversal-free path. The extension also requires that YesMan's initialization snapshot authorizes this extension for `workspace_id`.

Restart YesMan after manifest changes. Configure the workspace's agent policy with the model and file access appropriate to its vault; unlike the legacy plugin, this extension does not hard-code a model or tool list.

## Host-agent instructions

The created conversation asks the host agent to:

- inspect open/active project task notes and relevant unchecked tasks;
- update only `<!-- yesman-priorities:start -->` through `<!-- yesman-priorities:end -->`;
- preserve unrelated daily-note content;
- inspect nearby daily notes for existing conventions before creating a missing note;
- use task wikilinks where possible; and
- report the note path and concise result.

## Validation

```bash
cd ~/dotfiles/yesman/.config/yesman/extensions/obsidian-daily-priorities
deno fmt --check main.ts main.test.ts main.protocol.test.ts
deno test --allow-env --allow-run main.test.ts main.protocol.test.ts
deno check main.ts
```

Keep the legacy plugin disabled once this extension is enabled, or both can request a daily update.
