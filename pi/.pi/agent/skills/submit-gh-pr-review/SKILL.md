---
name: submit-gh-pr-review
description: Submits a PR review to GitHub with inline file comments.
---

# PR Review Submitter

You take a pr review and submit it to github using the cli

## Steps

### 1. Identify the PR

If a PR number was provided, use it. Otherwise detect it:

```sh
gh pr list --head "$(git branch --show-current)" --json number,headRepository --jq '.[0] | {number, repo: .headRepository.nameWithOwner}'
```

If no PR exists, tell the user and stop.


### 2. Determine the review verdict

Based on the **included** findings:

- Any P0  → `REQUEST_CHANGES`
- Only P1 or below → `COMMENT`
- No findings / only nitpiks → `APPROVE`


### 3. Build inline comments

For each included finding that has a `path` and `line`, build a comment object.
These appear as inline comments on specific files/lines in the PR.

Each comment object:

```json
{
  "path": "src/example.rs",
  "line": 42,
  "side": "RIGHT",
  "body": "**Title**: Description...\n\n**Suggestion**:\n```rust\n// suggested code\n```"
}
```

If there are more than 30 inline comments, consolidate P3 findings into the
review body instead to stay within GitHub's limits.

### 4. Build the review payload

Construct a **single JSON object** with `event`, `body`, and `comments`:

```json
{
  "event": "COMMENT",
  "body": "## Summary\n\n...",
  "comments": [
    {
      "path": "src/example.rs",
      "line": 42,
      "side": "RIGHT",
      "body": "**Title**: ..."
    }
  ]
}
```

The `body` field should contain:

- A brief summary of the review
- Any cross-cutting or architectural findings (no specific file + line)
- Any findings that were consolidated from the `comments` array due to limits

**Critical rules**:

- The entire payload MUST be a single JSON object.
- Do NOT use `-f` flags with `gh api` — everything goes through `--input -`.
- Every finding with a file + line goes in `comments`, not in `body`.
- Only cross-cutting or architectural findings (no specific line) go in `body`.

### 5. Submit the review

Pipe the JSON payload via stdin:

```sh
gh api repos/{owner}/{repo}/pulls/<number>/reviews \
  -X POST --input - << 'REVIEW_EOF'
{
  "event": "<verdict>",
  "body": "<summary>",
  "comments": [<comment objects>]
}
REVIEW_EOF
```

### 6. Handle errors

If the submission fails:

1. **"Pull request review thread position is invalid"** or **"position could
   not be resolved"** — The line number doesn't exist in the diff. First re-evaulate and retry.
   if you still have problems remove the offending comment from the `comments` array, add 
   it to the `body` instead, and retry.

3. **Validation errors on comments** — Remove invalid comments, add them to
   the `body` as a fallback, and retry.

### 7. Report

Output:

- The review URL (extract from the API response: the review `html_url`)
- How many inline comments were posted
- How many findings were folded into the body (if any)
- The verdict that was submitted

## Rules

- Always try inline comments first — only fall back to body text when the API
  rejects a comment.
- Do not modify the content of findings beyond what the user requested.
- Use `--input -` with a heredoc for submission. Never write temp files. Never
  mix `--input` with `-f` flags.
