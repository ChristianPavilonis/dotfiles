# obsidian-daily-priorities

Scheduled Yesman plugin that asks the global `pi` harness to create/update today's Obsidian daily note with priorities from open/active task notes.

## Behavior

- Registers a daily schedule: `0 7 * * *` (7:00 AM daily).
- Handles `obsidian.daily-priorities.update`.
- Calls `ctx.harness.run("pi", ...)`, so it depends on the `pi-harness` plugin.
- Updates only the managed block in `daily/YYYY-MM-DD.md`:

```markdown
<!-- yesman-priorities:start -->
## Priorities

...
<!-- yesman-priorities:end -->
```

## Manual run

```bash
yesman emit obsidian.daily-priorities.update '{}'
```

For a specific date:

```bash
yesman emit obsidian.daily-priorities.update '{"date":"2026-05-21"}'
```

## Optional config

```bash
yesman config set obsidian-daily-priorities vault_path '"/Users/christian/Documents/MyObsidianVault"'
yesman config set obsidian-daily-priorities daily_folder '"daily"'
yesman config set obsidian-daily-priorities max_tasks 12
```
