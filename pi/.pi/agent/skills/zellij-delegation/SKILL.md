---
name: zellij-delegation
description: Delegate independent subtasks to Pi agents in Zellij panes. Use when parallel work is useful, the user requests delegation, or existing workers need coordination.
---

# Zellij delegation

Use workers for independent tasks while the main agent keeps working. Prefer a small number of bounded assignments over splitting every step. Keep short or tightly coupled work local.

## Assign ownership

Default to the same checkout, with exclusive ownership of edited files for each agent, including the main agent. Read-only research and reviews can overlap.

Track worker pane IDs, assignments, and file ownership. If an agent needs to edit outside its assignment, it must ask the main agent first. Coordinate commands that rewrite shared files or generated output.

## Launch workers

1. Read `ZELLIJ_PANE_ID` from the environment and normalize it to `terminal_<id>`. This is the parent pane, not necessarily the focused pane. Confirm Zellij tools are available. If they are unavailable, continue locally.
2. Build each worker's assignment as described below before launching it.
3. Create each worker with `zellij_new_pane`, an explicit `cwd`, a short task name, `command: "pi <quoted-assignment>"`, and `closeOnExit: true`. Quote the full assignment as one argument for the launch shell so Pi receives it as its initial prompt. Default to panes in this session's tab. Leave placement and `tabId` unset for automatic pane grouping.
4. Record the returned pane ID. If creation reports a partial failure, inspect `zellij_list_panes` before retrying so you do not create duplicate workers.

Start each assignment with an instruction to read [worker.md](worker.md). Resolve that file to an absolute path from this skill's directory so the worker can find it from any working directory. Include the path, not a copy of its contents.

Then include only task-specific details:

- Objective and enough context to work without the parent's conversation.
- Working directory, owned files, and whether edits are allowed.
- Completion criteria and required checks.
- Parent pane ID and relevant peer pane IDs.

Launch the independent tasks, then continue the main agent's own assignment.

## Communicate

Send follow-up messages to explicit pane IDs with `zellij_write_pane`, `mode: "paste"`, and `submit: true`.

Require acknowledgment before relying on a changed assignment or handoff.

Check progress between useful chunks of local work rather than repeatedly polling. Read the visible screen first; request scrollback only when needed.

## Collect and close

1. Collect an explicit result from every worker, including findings or changed files, checks run, and anything unresolved. Preserve useful details in the main conversation before closing its pane.
2. Review the combined work and run the combined checks. Resolve gaps with the existing workers before releasing them.
3. Once a worker is finished and its Pi editor is idle, send `/quit`. The launch-time `closeOnExit: true` closes the pane when Pi exits.
4. Confirm with `zellij_list_panes` that released worker panes are gone. If a pane remains, inspect it before retrying. Close only workers created for this delegation; leave the user's other panes alone.

Keep panes open only when the user requests it or unresolved work still needs them.
