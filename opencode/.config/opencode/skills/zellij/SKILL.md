---
name: zellij
description: Manage, read and write to zellij sessions tabs and panels
---

# Zellij Pane Control Skill

> **Requires Zellij >= 0.44.0.** This skill relies on CLI features (`list-panes`, `send-keys`, `paste`, `subscribe`, `--pane-id` targeting) that were introduced in version 0.44.0.

Use Zellij as a control and observation layer for long-running terminal tasks, services, and other AI agents that are running in existing panes.

This skill teaches an agent how to safely:

* discover active sessions, tabs, and panes
* create new panes and tabs programmatically
* resolve the correct target pane before acting
* send text, keystrokes, or raw bytes to a pane
* inspect pane output before and after actions
* monitor running panes for completion, prompts, and failures
* manage pane layout, sizing, and lifecycle
* recover when pane ids change or sessions restart

This skill is designed for **existing panes**. Do not assume the focused pane is the correct pane. Always identify the target pane explicitly.

---

## When to use this skill

Use this skill when you need to:

* control a shell running in another pane
* send commands to a service or REPL already running in a pane
* coordinate multiple panes that each have a distinct role
* supervise one or more AI agents operating in their own panes
* observe terminal output without taking over the user's focus

Do not use this skill as the only source of truth for application state when a cleaner machine-readable interface exists, such as logs, sockets, or files. Prefer those sources when available, and use Zellij as a human-visible control and fallback layer.

---

## Core rules

1. Never send input to a pane until you have verified it is the intended target.
2. Prefer targeting by **pane id** after discovery, never by current focus alone.
3. Use `write-chars` for ordinary text commands.
4. Use `send-keys` for Enter, Escape, arrows, Ctrl-C, and other non-text controls.
5. Use `write` only when raw bytes are actually required.
6. Before sending a new command, inspect pane output and determine whether the pane is ready.
7. If the pane state is ambiguous, stop and inspect more output instead of guessing.
8. Do not interrupt running processes unless explicitly instructed or a recovery step requires it.
9. Re-resolve pane ids when sessions, tabs, or layouts may have changed.
10. Treat rendered pane output as helpful but imperfect; TUIs and rapidly redrawing programs may require extra care.

---

## Preconditions

Before acting, confirm the environment supports Zellij programmatic control:

* `zellij` is installed and available on `PATH`
* there is an active Zellij session
* the process has permission to run `zellij action ...` commands in the relevant environment

Sanity checks:

```bash
command -v zellij
zellij list-sessions
zellij action list-panes --json
```

If `list-panes` fails, stop and diagnose the session context before sending any input.

---

## Pane discovery workflow

Always discover panes before taking action.

### List panes

```bash
zellij action list-panes --json
```

Use the pane metadata to identify the correct target by:

* pane id
* pane title
* tab name
* current command
* current working directory
* exit state
* whether the pane is terminal vs plugin

### Preferred targeting strategy

Resolve panes by the most stable identifiers available, in this order:

1. exact pane title
2. title prefix or naming convention
3. current command
4. cwd
5. tab name plus one of the above
6. focus state only as a weak hint

Do not act on a pane solely because it is focused.

### Example discovery patterns

```bash
zellij action list-panes --json | jq
```

Find panes whose titles start with `agent:`:

```bash
zellij action list-panes --json \
  | jq -r '.[] | select(.title | startswith("agent:"))'
```

Find a pane titled `agent:coder` and print a Zellij pane target string:

```bash
PANE_ID=$(zellij action list-panes --json \
  | jq -r '.[] | select(.title == "agent:coder") | "terminal_\(.id)"')
```

If multiple panes match, inspect each candidate before acting.

---

## Pane naming conventions

When possible, use consistent titles so agents can discover panes deterministically.

Recommended title prefixes:

* `agent:*` for autonomous agents
* `service:*` for long-running application processes
* `logs:*` for passive log watchers
* `shell:*` for general interactive shells
* `db:*` for database consoles or migrations
* `build:*` for build/test panes

Examples:

* `agent:planner`
* `agent:coder`
* `agent:review`
* `service:api`
* `service:web`
* `logs:worker`
* `build:tests`

If multiple panes could match a role, make the title more specific instead of relying on focus or position.

---

## Creating panes

There are three ways to create a new pane. All three return the created pane ID on stdout (format: `terminal_<id>` or `plugin_<id>`). Always capture this ID for subsequent targeting.

**Important**: Without `--cwd`, new panes inherit the working directory from the session or parent context, often defaulting to `$HOME`. Always specify `--cwd` explicitly when the working directory matters for your commands.

### Open a new shell pane

Use `new-pane` to open a blank terminal pane.

```bash
# Open in the biggest available space (inherits current working directory)
zellij action new-pane

# Open to the right of the current pane with explicit working directory
zellij action new-pane --direction right --cwd ~/projects/myapp

# Open below the current pane
zellij action new-pane --direction down --cwd ~/work
```

Common options:

```bash
# Named pane with a specific working directory
zellij action new-pane --name "shell:project" --cwd ~/projects/myapp

# Floating pane with explicit dimensions
zellij action new-pane --floating --name "scratch" --width 80 --height 24

# Floating pane pinned on top
zellij action new-pane --floating --pinned true --name "monitor"

# Open in place of the current pane (suspends the current one)
zellij action new-pane --in-place --name "temp-shell"

# Open stacked (collapsed alongside other stacked panes)
zellij action new-pane --stacked --name "worker:1"

# Start suspended — the pane shows but does not run until Enter is pressed
zellij action new-pane --start-suspended --name "ready:deploy"
```

### Run a command in a new pane

Use `zellij run` to open a pane that executes a specific command.

```bash
# Run tests in a new pane
zellij run --name "build:tests" -- cargo test

# Run a service in a floating pane
zellij run --floating --name "service:api" -- npm run dev

# Run and close the pane automatically when the command exits
zellij run --close-on-exit --name "task:migrate" -- ./migrate.sh

# Run and block the calling shell until the command finishes
zellij run --name "build:check" -- cargo check --block-until-exit

# Block only on failure (useful for CI-like gating)
zellij run --name "build:lint" -- cargo clippy --block-until-exit-failure
```

### Capture the pane ID

All creation commands print the pane ID. Capture it for later use:

```bash
PANE_ID=$(zellij action new-pane --name "agent:worker" --cwd ~/work)
echo "Created pane: $PANE_ID"

# Now target it
zellij action write-chars --pane-id "$PANE_ID" "echo hello"
zellij action send-keys --pane-id "$PANE_ID" "Enter"
```

### Open a file in your editor

Use `zellij edit` to open a file in `$EDITOR` / `$VISUAL` in a new pane.

```bash
# Open a file in a new pane
zellij edit src/main.rs

# Open at a specific line number
zellij edit --line-number 42 src/main.rs

# Open in a floating pane
zellij edit --floating src/config.toml

# Open in place of the current pane
zellij edit --in-place src/lib.rs
```

The editor pane ID is also returned on stdout.

---

## Creating tabs

Use `new-tab` to create a new tab. It returns the tab ID on stdout.

**Important**: Like panes, new tabs default to inheriting the session's working directory (often `$HOME`). Use `--cwd` to set the working directory for the tab and any panes created within it.

```bash
# Create a blank tab
zellij action new-tab

# Create a named tab
zellij action new-tab --name "backend"

# Create a tab with a specific working directory (recommended)
zellij action new-tab --name "frontend" --cwd ~/projects/frontend

# Create a tab with a layout
zellij action new-tab --name "dev" --layout dev-layout

# Create a tab that immediately runs a command
zellij action new-tab --name "tests" -- cargo test --watch
```

### Idempotent tab creation

Use `go-to-tab-name --create` to navigate to a tab by name, creating it if it does not exist. This is useful for ensuring a tab exists without duplicating it.

```bash
# Go to "backend" tab, or create it if missing
zellij action go-to-tab-name --create "backend"
```

When the tab is created, the new tab ID is printed to stdout.

---

## Managing tabs

### Discover tabs

```bash
# List all tabs as a table
zellij action list-tabs

# List tabs as JSON with all details
zellij action list-tabs --json --all

# Get current tab info
zellij action current-tab-info --json
```

### Navigate between tabs

```bash
# By name
zellij action go-to-tab-name "backend"

# By 1-based index
zellij action go-to-tab 3

# By stable tab ID
zellij action go-to-tab-by-id 7

# Cycle through tabs
zellij action go-to-next-tab
zellij action go-to-previous-tab
```

### Rename tabs

```bash
# Rename the focused tab
zellij action rename-tab "new-name"

# Rename by stable ID
zellij action rename-tab-by-id 7 "new-name"

# Reset to automatic naming
zellij action undo-rename-tab
```

### Reorder tabs

```bash
# Move tab left or right in the tab bar
zellij action move-tab left
zellij action move-tab right

# Target a specific tab by ID
zellij action move-tab --tab-id 7 left
```

### Close tabs

```bash
# Close the current tab
zellij action close-tab

# Close by stable ID
zellij action close-tab-by-id 7
```

---

## Managing panes

### Rename panes

```bash
# Rename a specific pane
zellij action rename-pane --pane-id "$PANE_ID" "service:api"

# Reset to automatic naming
zellij action undo-rename-pane --pane-id "$PANE_ID"
```

### Close panes

```bash
# Close a specific pane
zellij action close-pane --pane-id "$PANE_ID"
```

### Move and reposition panes

```bash
# Move a pane in a direction
zellij action move-pane --pane-id "$PANE_ID" right
zellij action move-pane --pane-id "$PANE_ID" down
```

### Resize panes

```bash
# Increase pane size at the right border
zellij action resize --pane-id "$PANE_ID" increase right

# Decrease pane size at the bottom border
zellij action resize --pane-id "$PANE_ID" decrease down

# Increase in all directions
zellij action resize --pane-id "$PANE_ID" increase
```

### Fullscreen and focus

```bash
# Toggle fullscreen for a pane
zellij action toggle-fullscreen --pane-id "$PANE_ID"

# Cycle focus
zellij action focus-next-pane
zellij action focus-previous-pane

# Move focus directionally
zellij action move-focus right
zellij action move-focus up
```

### Floating panes

```bash
# Convert an embedded pane to floating, or vice versa
zellij action toggle-pane-embed-or-floating --pane-id "$PANE_ID"

# Pin a floating pane so it stays on top
zellij action toggle-pane-pinned --pane-id "$PANE_ID"

# Show / hide / toggle all floating panes in a tab
zellij action show-floating-panes
zellij action hide-floating-panes
zellij action toggle-floating-panes

# Target a specific tab
zellij action show-floating-panes --tab-id 3
```

### Stack panes

Group panes into a stack (collapsed, tabbed layout within a tile).

```bash
# Stack specific panes together
zellij action stack-panes -- terminal_1 terminal_3 terminal_5
```

Pane IDs can be in `terminal_<id>`, `plugin_<id>`, or bare integer form (bare integers default to terminal).

### Pane appearance

```bash
# Set pane foreground and background colors
zellij action set-pane-color --pane-id "$PANE_ID" --fg "#00e000" --bg "#001a3a"

# Reset to terminal defaults
zellij action set-pane-color --pane-id "$PANE_ID" --reset
```

---

## Sending input

Choose the lowest-risk input method that matches the task.

### 1. Send normal text

Use `write-chars` for ordinary shell commands or replies.

```bash
zellij action write-chars --pane-id "$PANE_ID" "cargo test"
```

Then send Enter separately:

```bash
zellij action send-keys --pane-id "$PANE_ID" "Enter"
```

Why separate them:

* easier to reason about
* easier to retry safely
* avoids embedding shell-specific line endings into the command text

### 2. Paste larger text blocks

Use `paste` when sending multiline content that should behave like bracketed paste.

```bash
zellij action paste --pane-id "$PANE_ID" "line 1
line 2
line 3"
```

Use this for:

* multiline prompts
* code blocks
* structured text

Avoid using raw byte writes for ordinary multiline text when `paste` is sufficient.

### 3. Send control keys

Use `send-keys` for non-text interaction.

Examples:

```bash
zellij action send-keys --pane-id "$PANE_ID" "Enter"
zellij action send-keys --pane-id "$PANE_ID" "Ctrl c"
zellij action send-keys --pane-id "$PANE_ID" "Escape"
zellij action send-keys --pane-id "$PANE_ID" "Up"
```

Use this for:

* submitting input
* interrupting a process
* navigating a menu or prompt
* escaping an interactive mode

### 4. Send raw bytes

Use `write` only when arbitrary byte sequences are required.

```bash
zellij action write --pane-id "$PANE_ID" 102 111 111 13
```

That example sends:

* `102` = `f`
* `111` = `o`
* `111` = `o`
* `13` = carriage return

Use raw bytes for:

* non-standard control flows
* exact byte-oriented testing
* protocols that require byte-level precision

Avoid raw bytes for ordinary shell usage because they are harder to inspect and reason about.

---

## Reading pane output

Reading before and after writes is essential.

### Snapshot current rendered output

Use `dump-screen` when you want a one-time view of the pane.

```bash
zellij action dump-screen --pane-id "$PANE_ID"
```

To include more history:

```bash
zellij action dump-screen --pane-id "$PANE_ID" --full
```

Use this for:

* checking whether the pane is idle
* capturing visible output before sending a command
* verifying completion markers
* debugging a stuck pane

### Preserve ANSI when needed

If color or terminal formatting matters:

```bash
zellij action dump-screen --pane-id "$PANE_ID" --full --ansi
```

Only use ANSI-preserved output if your downstream logic can handle it.

### Monitor pane output continuously

Use `subscribe` for real-time observation.

```bash
zellij subscribe --pane-id "$PANE_ID" --format json
```

Use this for:

* long-running commands
* waiting for completion markers
* detecting prompts as soon as they appear
* supervising multiple agents or services

### Guidance for interpreting output

When reading output, look for:

* explicit prompts such as `>`, `$`, `READY>`, `waiting for input`
* success markers such as `Done`, `Finished`, `Completed`, `Exit 0`
* failure markers such as `error`, `failed`, `panic`, `traceback`
* signs that the process is still active
* whether the pane is actually waiting for input or only appears quiet

Do not assume the last visible line tells the whole story.

---

## Pane state model

Before sending input, classify the pane into one of these states.

### `idle`

The pane appears quiescent and has a shell prompt or equivalent ready state.

Action:

* safe to send a new command

### `running`

A process is actively producing output or clearly still executing.

Action:

* monitor only
* do not send new input unless the program explicitly expects it

### `waiting_for_input`

The pane is blocked on user input or a known prompt.

Action:

* safe to send the requested response

### `success`

The most recent operation clearly completed successfully.

Action:

* report the result or send the next task if appropriate

### `error`

The pane shows a failure, panic, traceback, or explicit unsuccessful completion.

Action:

* capture enough output to explain the error
* do not blindly retry without understanding the failure

### `unknown`

The pane state cannot be determined confidently.

Action:

* inspect more output
* avoid sending input until state is clarified

---

## Standard control loop

For each controlled pane, use this loop:

1. Resolve the pane id.
2. Read current pane output.
3. Classify the pane state.
4. If state is `idle` or `waiting_for_input`, decide whether to act.
5. Send the minimal necessary input.
6. Observe output until you reach one of:

   * prompt returned
   * success marker
   * error marker
   * explicit request for input
7. Re-classify and continue.
8. If the pane id becomes invalid or the pane disappears, re-discover before retrying.

Never send repeated Enter presses or duplicate commands just because nothing changed immediately.

---

## Examples

### Example: run tests in a known pane

Goal: ask the coder pane to run tests.

```bash
PANE_ID=$(zellij action list-panes --json \
  | jq -r '.[] | select(.title == "agent:coder") | "terminal_\(.id)"')

zellij action dump-screen --pane-id "$PANE_ID" --full
zellij action write-chars --pane-id "$PANE_ID" "cargo test"
zellij action send-keys --pane-id "$PANE_ID" "Enter"
```

Then monitor:

```bash
zellij subscribe --pane-id "$PANE_ID" --format json
```

### Example: interrupt a stuck process

Only do this after confirming the process is actually stuck or recovery explicitly requires it.

```bash
zellij action dump-screen --pane-id "$PANE_ID" --full
zellij action send-keys --pane-id "$PANE_ID" "Ctrl c"
```

After interruption, inspect output again before sending another command.

### Example: send multiline instructions to another agent

```bash
zellij action paste --pane-id "$PANE_ID" "Please summarize the failing tests.
Then propose the smallest fix.
Do not change unrelated code."
zellij action send-keys --pane-id "$PANE_ID" "Enter"
```

### Example: wait for a completion marker with polling

```bash
until zellij action dump-screen --pane-id "$PANE_ID" --full | grep -q "Finished"; do
  sleep 1
done
```

Use polling only when continuous subscription is not practical.

### Example: create a named pane, run a command, and monitor it

```bash
# Create a pane, capture its ID, run tests, and watch output
PANE_ID=$(zellij run --name "build:tests" --cwd ~/projects/myapp -- cargo test)
echo "Test pane: $PANE_ID"

# Wait for completion
until zellij action dump-screen --pane-id "$PANE_ID" --full | grep -q "test result"; do
  sleep 2
done

# Check the result
zellij action dump-screen --pane-id "$PANE_ID" --full
```

### Example: set up a multi-pane workspace in a new tab

```bash
# Create a named tab
TAB_ID=$(zellij action new-tab --name "dev")

# Create service panes within it
API_PANE=$(zellij action new-pane --name "service:api" --cwd ~/projects/api)
WEB_PANE=$(zellij action new-pane --direction right --name "service:web" --cwd ~/projects/web)
LOG_PANE=$(zellij action new-pane --direction down --name "logs:api")

# Start the services
zellij action write-chars --pane-id "$API_PANE" "cargo run"
zellij action send-keys --pane-id "$API_PANE" "Enter"

zellij action write-chars --pane-id "$WEB_PANE" "npm run dev"
zellij action send-keys --pane-id "$WEB_PANE" "Enter"

zellij action write-chars --pane-id "$LOG_PANE" "tail -f /var/log/api.log"
zellij action send-keys --pane-id "$LOG_PANE" "Enter"
```

### Example: idempotent tab-or-create pattern

```bash
# Ensure the "backend" tab exists and switch to it
zellij action go-to-tab-name --create "backend"

# Now create a pane inside it if needed
EXISTING=$(zellij action list-panes --json \
  | jq -r '.[] | select(.title == "service:api") | "terminal_\(.id)"')

if [ -z "$EXISTING" ]; then
  PANE_ID=$(zellij action new-pane --name "service:api" --cwd ~/projects/api)
else
  PANE_ID="$EXISTING"
fi
```

### Example: temporary floating task pane

```bash
# Run a one-off task in a floating pane that auto-closes
zellij run --floating --close-on-exit --name "task:format" -- cargo fmt

# Or block until the task completes
zellij run --floating --close-on-exit --block-until-exit --name "task:build" -- cargo build
```

---

## Multi-agent orchestration guidance

When supervising multiple agents across panes:

* keep one pane per role
* give each pane a stable title
* track pane ids in a short-lived runtime registry
* re-resolve ids after restarts or layout changes
* do not let one pane’s output accidentally drive another pane’s input

Recommended pattern:

* `agent:planner` creates tasks
* `agent:coder` performs implementation
* `agent:review` checks results
* `logs:*` panes provide passive visibility

Prefer explicit handoff markers in output, such as:

* `TASK READY`
* `NEEDS INPUT`
* `DONE`
* `FAILED`

These markers make external monitoring far more reliable than generic shell text.

---

## Recovery and error handling

### If a pane id no longer works

1. Re-run discovery:

```bash
zellij action list-panes --json
```

2. Re-resolve the intended pane by title, command, cwd, or tab.
3. Confirm it is the same pane role before retrying.

### If the pane output is unclear

1. Dump more scrollback:

```bash
zellij action dump-screen --pane-id "$PANE_ID" --full
```

2. Look for the last clear prompt or status line.
3. Do not guess.

### If the pane is a full-screen TUI

Rendered pane scraping may be less reliable.

Preferred fallback options:

* read application logs directly
* inspect files or sockets the process controls
* use service-specific interfaces if they exist
* use Zellij only for high-level observation and key injection

### If a process appears frozen

Before interrupting, check for:

* a hidden prompt farther up the scrollback
* a blocking network call or long-running task
* a confirmation prompt waiting for input
* a pager or TUI mode that changed the expected controls

Only send `Ctrl-C` when interruption is a deliberate recovery step.

---

## Unsafe behaviors to avoid

Do not:

* send commands to the focused pane without verifying it
* spam Enter or repeated commands into a quiet pane
* assume pane ids are stable forever
* parse complex TUIs as if they were plain logs
* interrupt processes just because output paused briefly
* rely on human-readable output when a machine-readable interface is available
* send raw bytes when ordinary text or key input would be safer

---

## Recommended helper commands

It is strongly recommended to wrap common Zellij flows in small helper scripts.

Example conventions:

* `zp-list` → list panes in a compact readable format
* `zp-find <title>` → resolve a pane id by title
* `zp-dump <title>` → dump a pane by title
* `zp-send <title> "command"` → send text plus Enter
* `zp-key <title> "Ctrl c"` → send a control key
* `zp-sub <title>` → subscribe to pane output by title

If helpers exist, prefer them over re-implementing JSON parsing in every task.

---

## Suggested helper behavior

### `zp-find`

Resolve a pane title to a targetable pane id string.

Behavior:

* exact title match first
* then prefix match if explicitly requested
* fail loudly if zero or multiple exact matches exist

### `zp-send`

Send normal text followed by Enter.

Behavior:

* resolve pane id
* optionally dump recent output first
* send `write-chars`
* send `Enter`

### `zp-dump`

Dump current pane output.

Behavior:

* resolve pane id
* call `dump-screen --full`

### `zp-sub`

Continuously observe pane output.

Behavior:

* resolve pane id
* call `subscribe --format json`

---

## Operational recommendations

For the most reliable automation, combine Zellij control with a side channel.

Ideal setup:

* use Zellij for visible control and operator intervention
* use logs, files, sockets, or structured IPC as the primary state channel
* teach each agent or service to emit explicit status markers
* keep pane titles stable and meaningful

This hybrid approach is usually much more robust than relying entirely on rendered terminal content.

---

## Quick reference

### Discover panes and tabs

```bash
zellij action list-panes --json
zellij action list-tabs --json --all
zellij action current-tab-info --json
```

### Create panes

```bash
zellij action new-pane --name "shell:work" --cwd ~/work
zellij action new-pane --floating --name "scratch"
zellij run --name "build:tests" -- cargo test
zellij edit src/main.rs
```

### Create tabs

```bash
zellij action new-tab --name "backend"
zellij action go-to-tab-name --create "backend"
```

### Send text

```bash
zellij action write-chars --pane-id "$PANE_ID" "echo hello"
zellij action send-keys --pane-id "$PANE_ID" "Enter"
```

### Send control key

```bash
zellij action send-keys --pane-id "$PANE_ID" "Ctrl c"
```

### Send raw bytes

```bash
zellij action write --pane-id "$PANE_ID" 102 111 111 13
```

### Dump pane output

```bash
zellij action dump-screen --pane-id "$PANE_ID" --full
```

### Subscribe to pane output

```bash
zellij subscribe --pane-id "$PANE_ID" --format json
```

### Close panes and tabs

```bash
zellij action close-pane --pane-id "$PANE_ID"
zellij action close-tab
zellij action close-tab-by-id 7
```

### Rename panes and tabs

```bash
zellij action rename-pane --pane-id "$PANE_ID" "new-name"
zellij action rename-tab "new-name"
zellij action rename-tab-by-id 7 "new-name"
```

### Resize and layout

```bash
zellij action resize --pane-id "$PANE_ID" increase right
zellij action toggle-fullscreen --pane-id "$PANE_ID"
zellij action toggle-pane-embed-or-floating --pane-id "$PANE_ID"
zellij action toggle-floating-panes
```

### Navigate tabs

```bash
zellij action go-to-tab-name "backend"
zellij action go-to-tab 3
zellij action go-to-next-tab
zellij action go-to-previous-tab
```

---

## Final directive

When using Zellij to control other panes:

* identify the target first
* inspect before writing
* send the smallest safe action
* observe the result
* recover deliberately, not blindly

Zellij is a powerful control surface, but safe operation depends on careful targeting, output inspection, and predictable pane naming.
