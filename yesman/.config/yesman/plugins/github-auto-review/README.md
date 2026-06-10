# github-auto-review

Polls configured GitHub repositories for open PRs requesting review from the authenticated `gh` user, opens each PR with Christian's `gwpr` worktree helper, runs Pi with the shared Trusted Server review prompt, and has the agent submit a live GitHub review with the `submit-gh-pr-review` skill.

## Behavior

- Schedule: once per hour at minute 0 (`0 0 * * * *`).
- Query: `gh pr list --search review-requested:@me` from each repo cwd.
- Freshness: skips PRs whose `updatedAt` is older than `max_pr_age_hours`.
- Worktree: `nu -l -c 'gwpr <pr>; pwd'`.
- Review prompt: loads `~/.pi/agent/prompts/ts-review.md` and fills in the PR target.
- Review agent: Pi harness in the PR worktree.
- Submission: the prompt appends automation instructions that tell Pi to use the `submit-gh-pr-review` skill.
- Verdicts: `COMMENT` or `REQUEST_CHANGES` only; never `APPROVE`.
- Idempotency: stores reviewed state by `repo + PR number + head SHA`.

## Config

Config lives in `plugin.toml` under `[config]`. The checked-in default is:

```toml
[config]
enabled = false
harness_name = "github-auto-review.pi"
thinking = "high"
max_prs_per_tick = 2
list_limit = 50
max_pr_age_hours = 24
review_prompt = """
Extra automated-review guidance appended to the shared prompt...
"""

[[config.repositories]]
name = "trusted-server"
cwd = "/home/christian/projects/trusted-server"
repo = "IABTechLab/trusted-server"
enabled = true
skipDrafts = true
```

You can edit `plugin.toml` directly or use `yesman config set`, which now updates the manifest.
Restart `yesman up` after hand-editing the manifest.

Config keys:

- `enabled` boolean, currently `false` until you explicitly turn it on
- `repositories` array, default trusted-server
- `harness_name` string, default `github-auto-review.pi`
- `thinking` string, default `high`
- `provider` string
- `model` string
- `tools` string array; omit to use Pi defaults
- `review_prompt` string; extra automated-review guidance appended to the shared `ts-review.md` prompt
- `max_prs_per_tick` integer, default `2`
- `list_limit` integer, default `50`
- `max_pr_age_hours` number, default `24`

## Manual poll

```bash
yesman emit github-auto-review.poll '{"reason":"manual"}'
```

Limit to configured repo names or `OWNER/REPO` values:

```bash
yesman emit github-auto-review.poll '{"reason":"manual","repos":["trusted-server"]}'
```
