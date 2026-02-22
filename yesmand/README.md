# yesmand

`yesmand` is a standalone automation daemon that uses OpenCode as an execution
backend while keeping your personal OpenCode environment clean.

## Goals

- Keep automation config separate from daily interactive OpenCode usage.
- Keep the core provider-agnostic (no GitHub-specific logic in core).
- Load integrations through plugin modules configured by users.
- Support polling-driven workflows (`@yesman`, `#plan`, approval gates, etc).

## Current MVP

- Polling engine (default every 5 minutes).
- Plugin SDK and dynamic plugin loading.
- OpenCode API client for session + `prompt_async` dispatch.
- SQLite dispatch dedupe store.
- GitHub plugin implementing:
  - trigger token in issue body (`@yesman`)
  - optional planning gate token (`#plan`)
  - owner-only approval via `:+1:` reaction
  - `agent-working` lock label and `agent-pr-created` done label

Detailed runtime behavior is documented in:

- `yesmand/docs/how-it-works.md`

## Plugin Contract (MVP)

Each plugin module must export:

- `createPlugin(config, ctx)`

And return an object implementing:

- `discoverCandidates(ctx)`
- `evaluateCandidate(item, ctx)`
- optional `onDispatchSuccess(...)`
- optional `onDispatchFailure(...)`

The core only understands generic dispatch decisions (`dispatch`, `wait`,
`skip`, `done`). Provider logic stays in the plugin.

## Setup

1. Copy config:

   `cp yesmand/config.example.json yesmand/config.json`

2. Ensure OpenCode server password env var is available (default config uses
   `OPENCODE_SERVER_PASSWORD` from `~/.config/opencode/.env`).

3. Install deps:

   `cd yesmand && bun install`

4. Dry-run one cycle:

   `bun run src/index.ts --once --dry-run --config ./config.json`

5. Run daemon loop:

   `bun run src/index.ts --config ./config.json`

## Isolating Automation OpenCode

Run a dedicated OpenCode service for automation with isolated XDG paths and a
separate port (example: `4097`).

Recommended environment for that service:

- `XDG_CONFIG_HOME=~/.config/yesman-opencode`
- `XDG_DATA_HOME=~/.local/share/yesman-opencode`
- `XDG_STATE_HOME=~/.local/state/yesman-opencode`
- `XDG_CACHE_HOME=~/.cache/yesman-opencode`
- `OPENCODE_DISABLE_PROJECT_CONFIG=1`

This prevents automation commands/plugins/models from polluting your personal
`~/.config/opencode/config.json` setup.

## Systemd Templates

Example unit files are included under:

- `yesmand/ops/systemd/opencode-automation.service`
- `yesmand/ops/systemd/yesmand.service`
- `yesmand/ops/systemd/yesmand.timer`
