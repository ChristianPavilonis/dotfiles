---
name: gh-pr-review
description: List PRs awaiting your review in the current repo, examine their changes, and provide structured code reviews.
---

## What I do
- List open PRs where you are a requested reviewer using `gh pr list`.
- For each PR, fetch the diff with `gh pr diff` (non-destructive, no branch checkouts).
- Review the changes and provide structured feedback: summary, issues, suggestions.

## When to use me
Use this when you want to review all PRs assigned to you in the current repository.

## How to use

### 1. List PRs awaiting your review

```sh
gh pr list --search "review-requested:@me" --json number,title,author,url,baseRefName,headRefName \
  --jq '.[] | {number, title, author: .author.login, url, base: .baseRefName, head: .headRefName}'
```

### 2. View PR details

```sh
gh pr view <number>
```

### 3. Fetch the diff for a specific PR

```sh
gh pr diff <number>
```

### 4. Fetch existing review comments

```sh
gh api repos/{owner}/{repo}/pulls/<number>/comments \
  --jq 'map({user: .user.login, path, line: (.line // .original_line), body})'
```

### 5. Submit a review (optional)

```sh
gh pr review <number> --approve --body "Looks good!"
gh pr review <number> --request-changes --body "See comments."
gh pr review <number> --comment --body "Some observations."
```

## Review process
For each PR:
1. Summarize the changes and their purpose.
2. Flag potential bugs, security issues, or performance concerns.
3. Suggest improvements with specific file and line references.
4. Note any missing tests or documentation.
5. Present the review in a structured format per PR.

## Notes
- Requires authenticated `gh` CLI access.
- Run from within the git repository you want to review PRs for.
- Uses `gh pr diff` to read changes without modifying the working tree.
