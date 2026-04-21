# How yesmand works

This document explains the current behavior of the standalone automation stack
(`yesmand`) and how it is separated from your personal OpenCode setup.

## Architecture at a glance

There are two runtime pieces:

1. `yesmand.service`
   - Long-running daemon process.
   - Hosts its own plugin scheduler.
2. `opencode-automation.service`
   - Dedicated OpenCode backend on `127.0.0.1:4097` used only by automations.

`yesmand.service` has `After/Wants=opencode-automation.service` and a pre-start
health wait, so startup blocks until the automation OpenCode endpoint is ready.

## Separation from personal OpenCode

Personal interactive OpenCode and automation OpenCode are separated.

- Personal OpenCode (existing): `opencode-web.service` on port `4096`
- Automation OpenCode: `opencode-automation.service` on port `4097`

Automation OpenCode uses isolated XDG paths:

- `XDG_CONFIG_HOME=~/.config/yesman-opencode`
- `XDG_DATA_HOME=~/.local/share/yesman-opencode`
- `XDG_STATE_HOME=~/.local/state/yesman-opencode`
- `XDG_CACHE_HOME=~/.cache/yesman-opencode`

It also uses automation-specific OpenCode config via:

- `OPENCODE_CONFIG=~/dotfiles/yesmand/ops/opencode-config.json`

This keeps automation commands/settings out of your personal
`~/.config/opencode/config.json` workflow.

## Scheduling model

Scheduling is plugin-owned.

- Every plugin provides either `schedule.everySeconds` or `schedule.everyMinutes`.
- Plugins can opt out of immediate startup run with `runOnStartup: false`.
- Plugins can add random jitter with `jitterSeconds`.
- Scheduler runs plugins in independent single-flight mode (no overlapping runs
  for the same plugin).

Plugin registry is code-based:

- `yesmand/src/plugins/index.ts`

Plugin config now lives in plugin source:

- `yesmand/src/plugins/github/index.ts`
- `yesmand/src/plugins/github-pr-reviews/index.ts`
- `yesmand/src/plugins/telegram/index.ts`

## Core behavior (provider-agnostic)

For each plugin run, the core engine does this:

1. Ask plugin to discover candidate work items.
2. Ask plugin to evaluate each item, returning one of:
   - `dispatch`
   - `wait`
   - `skip`
   - `done`
3. For `dispatch`, send prompt to OpenCode and persist a dedupe record.

Plugins also have plugin-scoped persistent key/value state through `ctx.state`
backed by SQLite (`plugin_state` table).

Deduping is stored in SQLite (`yesmand/data/yesmand.db`) in table `dispatches`
with a unique `dedupe_key`.

Dispatch execution lifecycle is also tracked in `dispatch_attempts`, including:

- `dispatch_started`
- `dispatch_sent`
- `running`
- terminal states: `completed`, `failed`, `stalled`, `timed_out`

yesmand polls OpenCode API session/message endpoints on a fixed interval and
updates attempt status based on latest message finish state and tool-part
progress.

When an attempt transitions into a terminal state (`completed`, `failed`,
`stalled`, `timed_out`), yesmand can call plugin `onDispatchTerminal(...)`
hooks with dispatch metadata and final assistant text (when available).

## GitHub plugin flow

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
4. Subsequent runs look for that marker comment.
5. Implementation only dispatches after a `:+1:` reaction from configured
   approver login on the plan comment.
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
- Dedupe key includes PR identity + source `updatedAt`, so subsequent runs do
  not re-review unchanged PRs.

## Telegram demo plugin flow

Plugin file: `yesmand/src/plugins/telegram/index.ts`

- Polls Telegram Bot API `getUpdates` using plugin-state cursor
  (`telegram:last_update_id`).
- Handles commands directly:
  - `/start`, `/help`: usage text
  - `/reset`: clears per-chat continuation state
- Dispatches one OpenCode session request for each non-command text message.
- Uses terminal callback to send final response back to Telegram chat.
- Supports fast cadence with `YESMAND_TELEGRAM_EVERY_SECONDS`.

## OpenCode dispatch details

For each dispatch decision, yesmand:

1. Creates an OpenCode session with `directory=<plugin-defined path>`, or
   continues in a previously dispatched session when requested by the plugin.
2. Sends `prompt_async` to that session.
3. Uses model object shape:
   - `{ providerID: "openai", modelID: "gpt-5.3-codex" }`

## Config and files

- Main yesmand config: `yesmand/config.json`
- Example config: `yesmand/config.example.json`
- Plugin registry: `yesmand/src/plugins/index.ts`
- Plugin config/code:
  - `yesmand/src/plugins/github/index.ts`
  - `yesmand/src/plugins/github-pr-reviews/index.ts`
  - `yesmand/src/plugins/telegram/index.ts`
- Automation OpenCode config: `yesmand/ops/opencode-config.json`
- Monitor config keys (in `config.json`):
  - `monitor.enabled`
  - `monitor.pollSeconds`
  - `monitor.stalledAfterMinutes`
  - `monitor.timeoutAfterMinutes`
- Unit files (managed under dotfiles/opencode package):
  - `opencode/.config/systemd/user/opencode-automation.service`
  - `opencode/.config/systemd/user/yesmand.service`

## Ops commands

Run daemon now:

```bash
systemctl --user start yesmand.service
```

Enable daemon on login:

```bash
systemctl --user enable yesmand.service
```

Check yesmand logs:

```bash
journalctl --user -u yesmand.service -n 100 --no-pager
```

Check automation OpenCode logs:

```bash
journalctl --user -u opencode-automation.service -n 100 --no-pager
```

Enable OpenAI auth keepalive timer (yesman profile):

```bash
systemctl --user enable --now yesman-openai-keepalive.timer
```

Run keepalive once now:

```bash
systemctl --user start yesman-openai-keepalive.service
```

Check keepalive logs for token/auth errors:

```bash
journalctl --user -u yesman-openai-keepalive.service -n 100 --no-pager | rg -i "failed to refresh token|401|unauthor|auth"
```
