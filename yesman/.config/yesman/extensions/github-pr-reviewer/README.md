# GitHub PR Reviewer extension

A standalone `yesman.extension/1` replacement for the legacy `plugins/github-auto-review` plugin. It polls configured GitHub repositories for open pull requests requesting review from the authenticated `gh` user, prepares the PR worktree with `gwpr`, and creates a durable YesMan conversation/run asking the host agent to review it.

## Plan and safety boundary

1. The extension independently polls GitHub because protocol v1 has no scheduler capability.
2. For each eligible PR head, it validates a `gwpr` worktree, then sends `conversations.create` with a stable JSON-RPC request ID derived from repository, PR number, and head SHA.
3. YesMan's durable receipt prevents duplicate review conversations across extension restarts or lost responses.
4. The host agent performs the review and any GitHub submission. **The extension never submits a GitHub review itself.**
5. A changed head generates a different request ID and must be reviewed anew.

The extension starts disabled and has no repositories configured. It can act only for configured workspace IDs that YesMan included in its current enabled-workspace snapshot. YesMan independently enforces that authorization before it creates the conversation.

## Configuration

Copy a real repository entry into `extension.toml` and replace every placeholder:

```toml
[config]
enabled = true
poll_interval_seconds = 900
max_prs_per_poll = 1
list_limit = 50
max_pr_age_hours = 24
skip_drafts = true

[[config.repositories]]
name = "yesman"
repo = "OWNER/REPOSITORY"
cwd = "/absolute/path/to/local/repository"
workspace_id = "the durable UUIDv7 of the YesMan workspace"
enabled = true
```

`workspace_id` is required because the protocol intentionally does not let an extension create arbitrary workspace scope. Configure and enable the extension for that workspace through YesMan's ordinary extension controls, then restart the service after manifest changes.

The extension requires `deno`, `gh`, `git`, and the login-shell Nushell `gwpr` helper. It inherits only `HOME`, `PATH`, optional GitHub tokens, and `LANG` from the manifest.

## Review behavior

- Skips draft PRs when configured and heads older than `max_pr_age_hours`.
- Skips a head already reviewed by the authenticated GitHub user.
- Validates that `gwpr` produces a worktree at the exact requested head before creating YesMan work.
- Tells the host agent to review from that worktree, avoid edits, recheck the head before submission, submit only `COMMENT` or `REQUEST_CHANGES`, and never approve.
- Does not clean up worktrees; `gwpr` remains the single owner of that lifecycle.

## Validation

```bash
cd ~/dotfiles/yesman/.config/yesman/extensions/github-pr-reviewer
deno fmt --check main.ts main.test.ts
deno test --allow-env --allow-read --allow-run main.test.ts
deno check main.ts
```

The legacy SDK plugin remains in `plugins/github-auto-review/` during migration. Do not enable both implementations for the same repositories.
