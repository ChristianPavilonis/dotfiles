# How yesmand works

This document explains the current MVP behavior of the standalone automation
stack (`yesmand`) and how it is separated from your personal OpenCode setup.

## Architecture at a glance

There are three runtime pieces:

1. `yesmand.timer`
   - Triggers every 5 minutes.
2. `yesmand.service`
   - Runs one polling cycle (`--once`) and exits.
3. `opencode-automation.service`
   - Dedicated OpenCode backend on `127.0.0.1:4097` used only by automations.

For PR review automation there is a separate timer/service pair:

- `yesmand-pr-reviews.timer`
- `yesmand-pr-reviews.service`

`yesmand.service` has `After/Wants=opencode-automation.service` and a pre-start
health wait, so each run waits until the automation OpenCode endpoint is ready.

## Separation from personal OpenCode

Personal interactive OpenCode and automation OpenCode are separated.

- Personal OpenCode (existing): `opencode-web.service` on port `4096`
- Automation OpenCode (new): `opencode-automation.service` on port `4097`

Automation OpenCode uses isolated XDG paths:

- `XDG_CONFIG_HOME=~/.config/yesman-opencode`
- `XDG_DATA_HOME=~/.local/share/yesman-opencode`
- `XDG_STATE_HOME=~/.local/state/yesman-opencode`
- `XDG_CACHE_HOME=~/.cache/yesman-opencode`

It also uses automation-specific OpenCode config via:

- `OPENCODE_CONFIG=~/dotfiles/yesmand/ops/opencode-config.json`

This keeps automation commands/settings out of your personal
`~/.config/opencode/config.json` workflow.

## Core behavior (provider-agnostic)

The core engine does this each cycle:

1. Load configured plugins.
2. Ask each plugin to discover candidate work items.
3. Ask plugin to evaluate each item, returning one of:
   - `dispatch`
   - `wait`
   - `skip`
   - `done`
4. For `dispatch`, send prompt to OpenCode and persist a dedupe record.

Deduping is stored in SQLite (`yesmand/data/yesmand.db`) in table `dispatches`
with a unique `dedupe_key`.

## GitHub plugin flow (current)

Plugin file: `yesmand/src/plugins/github/index.ts`

### Trigger and filters

An issue is a candidate if:

- issue body contains `@yesman`
- issue does not have `agent-pr-created`

### Locking and state labels

- `agent-working` is used as the lock/claimed state.
- `agent-pr-created` is treated as terminal skip state.

### Plan-gated flow (`#plan`)

If issue body contains `#plan`:

1. If not yet working, plugin adds `agent-working`.
2. Dispatches a **plan** session (once) with dedupe key:
   - `<owner/repo>#<issue>:plan:v1`
3. Plan session must comment with marker:
   - `<!-- yesman-plan:v1 -->`
4. Subsequent polls look for that marker comment.
5. Implementation only dispatches after a `:+1:` reaction from configured
   approver login (currently `ChristianPavilonis`) on the plan comment.
6. Implementation dispatch continues in the same OpenCode session used for
   planning when that plan session is available.
7. On implementation dispatch, plugin writes marker comment:
   - `<!-- yesman-implementation-dispatched:v1 -->`

Implementation dedupe key in this mode includes plan comment id:

- `<owner/repo>#<issue>:implementation:plan-comment:<commentId>`

### Direct implementation flow (no `#plan`)

If issue has `@yesman` but not `#plan`, plugin dispatches implementation
directly with dedupe key:

- `<owner/repo>#<issue>:implementation:v1`

## GitHub PR reviews plugin flow

Plugin file: `yesmand/src/plugins/github-pr-reviews/index.ts`

- Scans configured repos for:
  - PRs requested from `@me` and not reviewed by `@me`
  - your PRs with `CHANGES_REQUESTED`
- Filters to recent updates (`lookbackHours`, default 24).
- Builds one work item per PR and dispatches one OpenCode session per PR into
  the internal review repo (`~/projects/stackpop-reviews`).
- Agent writes markdown files under `reviews/<owner>/<repo>/pr-<number>.md`.
- Agent is instructed to never comment/review publicly on GitHub.
- Agent commits and pushes generated review notes to `origin/master`.
- Dedupe key includes PR identity + source `updatedAt`, so hourly runs do not
  re-review unchanged PRs.

### Worktree/branch strategy

- Worktree root: `~/worktrees`
- Worktree path: `~/worktrees/<repo>-issue-<number>`
- Branch: `agent/issue-<number>`

If worktree already exists, it is reused.

## OpenCode dispatch details

For each dispatch decision, yesmand:

1. Creates an OpenCode session with `directory=<plugin-defined path>`, or
   continues in a previously dispatched session when requested by the plugin.
2. Sends `prompt_async` to that session.
3. Uses model object shape:
   - `{ providerID: "openai", modelID: "gpt-5.3-codex" }`

## Config and files

- Main yesmand config: `yesmand/config.json`
- PR reviews config: `yesmand/config.pr-reviews.json`
- Example config: `yesmand/config.example.json`
- PR reviews example config: `yesmand/config.pr-reviews.example.json`
- Automation OpenCode config: `yesmand/ops/opencode-config.json`
- Unit files (managed under dotfiles/opencode package):
  - `opencode/.config/systemd/user/opencode-automation.service`
  - `opencode/.config/systemd/user/yesmand.service`
  - `opencode/.config/systemd/user/yesmand.timer`
  - `opencode/.config/systemd/user/yesmand-pr-reviews.service`
  - `opencode/.config/systemd/user/yesmand-pr-reviews.timer`

## Ops commands

Manual run now:

```bash
systemctl --user start yesmand.service
```

Check timer:

```bash
systemctl --user status yesmand.timer
```

Check yesmand logs:

```bash
journalctl --user -u yesmand.service -n 100 --no-pager
```

Check automation OpenCode logs:

```bash
journalctl --user -u opencode-automation.service -n 100 --no-pager
```

## Current MVP limitations

- `agent-pr-created` is used as a skip signal, but the plugin does not yet set
  this label automatically after PR creation (the agent prompt still handles PR
  creation/commenting).
- Deduping depends on the local SQLite store. If the DB is deleted, prior
  dispatch history is lost and items may re-dispatch.
