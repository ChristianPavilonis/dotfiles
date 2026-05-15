---
name: handoff
description: Use after planning when the user wants to hand work to a fresh agent. Writes the implementation plan to a temporary file, creates a git worktree, then opens a new Zellij tab with a Pi session and concise handoff prompt.
---

# Handoff

Use this skill when the current agent has finished planning and the user wants another Pi agent to execute the plan in an isolated worktree.

This is the preferred flow:

1. Write the plan to a temporary markdown file.
2. Create a new git worktree for the implementation.
3. Open a new Zellij tab running Pi in that worktree.
4. Give the new agent a short handoff prompt that points at the plan file.

## Rules

- Keep the spawned prompt short. The plan file carries the details.
- Do not paste a huge plan into the prompt; write it to disk and reference the path.
- Use the user's Nushell worktree helpers through login Nushell.
- Prefer `gwa <branch> -n` for a new branch/worktree so the current session remains in place.
- If the branch/worktree name is unclear, suggest a short slug from the task and ask one focused confirmation question.
- Do not delete worktrees or modify existing worktrees unless the user explicitly asks.
- Preserve any current uncommitted work. If worktree creation fails because of repo state, report the error and ask how to proceed.

## Plan file

Create a durable temp directory and write the plan as markdown:

```bash
mkdir -p /tmp/pi-handoffs
PLAN_FILE="/tmp/pi-handoffs/$(date +%Y%m%d-%H%M%S)-<slug>.md"
```

The plan file should include:

- Goal / user request
- Context discovered while planning
- Step-by-step implementation plan
- Files likely to change
- Validation commands to run
- Risks, gotchas, and open questions
- Any constraints from the user

## Worktree creation

Use login Nushell so `gwa` is available (or use nushell tool if available):

```bash
nu -l -c 'gwa <branch-slug> -n'
```

Then determine the worktree path from helper output or:

```bash
git worktree list --porcelain
```

Pick the worktree whose branch matches the new branch slug.

## Spawn the handoff agent

Use `zellij_spawn_pi_tab` with the worktree path as `cwd`.

Example:

```json
{
  "cwd": "/path/to/worktree",
  "name": "pi-<short-slug>",
  "prompt": "Implement the plan in /tmp/pi-handoffs/20260514-153000-short-slug.md. Read it first, then make the changes, run validation, and summarize results."
}
```

If the prompt needs extra context, keep it to one or two sentences.

## Checklist

Before spawning, confirm you have:

- Written the plan file and verified the path.
- Created the worktree successfully.
- Identified the exact worktree path.
- Chosen a short Zellij tab name.
- Included the plan file path in the prompt.
