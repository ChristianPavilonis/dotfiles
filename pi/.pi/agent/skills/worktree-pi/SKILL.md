---
name: worktree-pi
description: Use when the user asks to create, select, or use a git worktree and then spawn or coordinate a Pi agent in that worktree. Applies to workflows involving the user's Nushell helpers `gwa`, `gws`, or `gwpr`, isolated branches, PR worktrees, parallel agents, or launching Pi in a newly-created worktree.
---

# Worktree Pi

Use this skill for the user's preferred flow: use their Nushell git-worktree helpers, then optionally spawn a Pi tab in the resulting worktree.

Helpers:

- `gwa` — create/add an ad hoc worktree/branch workflow
- `gws` — select/switch to an existing worktree workflow
- `gwpr` — create/open a PR worktree workflow

Run helper commands through login Nushell so custom functions are available. Prefer the `nushell` tool when available:

```bash
nu -l -c 'gwa ...'
nu -l -c 'gws ...'
nu -l -c 'gwpr ...'
```

## Workflow

1. Pick the helper from the user's request: PR → `gwpr`, new branch/task → `gwa`, existing worktree → `gws`.
2. If arguments or helper behavior are unclear, ask one focused question instead of guessing.
3. Run the helper with login Nushell.
4. Determine the resulting worktree path from helper output or `git worktree list --porcelain`.
5. If the user wants a Pi agent there, call `zellij_spawn_pi_tab` with that path as `cwd` and a short tab name.

Example spawn:

```json
{
  "cwd": "/path/to/worktree",
  "name": "pi-pr-123",
  "prompt": "You are in the PR #123 worktree. Review the changes and report findings."
}
```

Keep the flow simple. Do not delete worktrees or spawn multiple agents unless explicitly asked.
