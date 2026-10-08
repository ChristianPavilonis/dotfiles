---
name: zellij-delegation
description: Coordinate subtasks with Pi workers in Zellij panes when the current agent retains responsibility for the combined result. Use for parallel subtasks or existing worker coordination, not independent task handoffs.
---

# Zellij delegation

Use workers for independent subtasks while the main agent keeps working and owns the combined result. Prefer a small number of bounded assignments over splitting every step. Keep short or tightly coupled work local.

## Delegation or handoff

Choose by task ownership, not by whether another Pi session is launched. Delegation keeps the current agent responsible for collecting worker results. A task handoff transfers ownership to a standalone agent and leaves the original conversation free for other work.

For a task handoff, follow [handoff](../handoff/SKILL.md) and stop applying this worker workflow. The handoff agent reports to the user in its own tab. Keep worker instructions and parent pane IDs out of its plan and prompt; leave its progress, results, and tab lifecycle to the user.

## Assign ownership

Default to the same checkout, with exclusive ownership of edited files for each agent, including the main agent. Read-only research and reviews can overlap.

Track worker pane IDs, assignments, and file ownership. If an agent needs to edit outside its assignment, it must ask the main agent first.

For delegated checks, read [verification.md](../engineering-principles/references/verification.md) and apply its scheduling and evidence reuse rules. Assign one command owner at a time for each shared build directory, mutable database fixture, or generated output. Workers run assigned focused checks; the coordinator schedules integration checks. Serialize commands that compete for those resources, including Cargo commands sharing a target directory and global formatting while workers edit. Checks with independent resources may run concurrently.

## Choose worker models

Honor any model requested by the user. Otherwise, prefer GPT-6 Luna (`openai-codex/gpt-6-luna`) for scouting and research. For implementation, debugging, design, and reviews, choose a model suited to the task's complexity and risk rather than inheriting the global default.

Confirm availability with `pi --list-models <search>` and pass the exact `provider/model-id` with `--model`. If the preferred model is unavailable, choose an available task-suited alternative and report the substitution to the user.

## Launch workers

1. Read `ZELLIJ_PANE_ID` from the environment and normalize it to `terminal_<id>`. This is the parent pane, not necessarily the focused pane. Confirm Zellij tools are available. If they are unavailable, continue locally.
2. Build each worker's assignment as described below and select its model before launching it.
3. Create each worker with `zellij_new_pane`, an explicit `cwd`, a short task name, `command: "pi --session-dir ~/.pi/agent/worker-sessions --model <provider/model-id> <quoted-assignment>"`, and `closeOnExit: true`. Quote the full assignment as one argument for the launch shell so Pi receives it as its initial prompt. Default to panes in this session's tab. Leave placement and `tabId` unset for automatic pane grouping.
4. Record the returned pane ID. If creation reports a partial failure, inspect `zellij_list_panes` before retrying so you do not create duplicate workers.

Start each assignment with an instruction to read [worker.md](worker.md). Resolve that file to an absolute path from this skill's directory so the worker can find it from any working directory. Include the path, not a copy of its contents.

Then include only task-specific details:

- Objective and enough context to work without the parent's conversation.
- Working directory, owned files, and whether edits are allowed.
- Completion criteria, assigned focused checks, shared command owner, and integration checks reserved for the coordinator.
- Parent pane ID and relevant peer pane IDs.

Worker transcripts persist separately from normal session history. Browse them with `pi --session-dir ~/.pi/agent/worker-sessions --resume` from the worker's working directory.

Launch the independent tasks, then continue the main agent's own assignment.

## Communicate

Send follow-up messages to explicit pane IDs with `zellij_write_pane`, `mode: "paste"`, and `submit: true`.

Require acknowledgment before relying on a changed worker assignment or a transfer of work between coordinated workers.

Check progress between useful chunks of local work rather than repeatedly polling. Read the visible screen first; request scrollback only when needed.

## Collect and close

1. Collect an explicit result from every worker, including findings or changed files, checks and their tested state, evidence locations, and anything unresolved. Preserve useful details in the main conversation before closing its pane.
2. Review the combined work, confirm reusable check evidence, and run integration checks and any remaining affected checks at a stable checkpoint. Resolve gaps with the existing workers before releasing them.
3. Once a worker is finished and its Pi editor is idle, send `/quit`. The launch-time `closeOnExit: true` closes the pane when Pi exits.
4. Confirm with `zellij_list_panes` that released worker panes are gone. If a pane remains, inspect it before retrying. Close only workers created for this delegation; leave the user's other panes alone.

Keep panes open only when the user requests it or unresolved work still needs them.
