---
name: gh-pr-comments
description: Fetch GitHub pull request review comments with gh api and normalize fields for downstream review tooling.
---

## What I do
- Call the GitHub API for PR review comments via the gh CLI.
- Normalize output to an array of {user, path, line, body} objects.
- Use line = line ?? original_line to preserve context.

## When to use me
Use this when you need pull request review comments outside the GitHub UI or for automated review workflows.

## How to use
- Command template:

```sh
gh api repos/{owner}/{repo}/pulls/{pull_id}/comments \
  --jq 'map({user: .user.login, path, line: (.line // .original_line), body})'
```

- Example:

```sh
gh api repos/anomalyco/opencode/pulls/123/comments \
  --jq 'map({user: .user.login, path, line: (.line // .original_line), body})'
```

## Notes
- Requires authenticated gh CLI access.
