---
description: Review a Trusted Server PR or branch diff without sub-agents
---
Review this Trusted Server change as a senior reviewer. Be EXTREMELY thorough, rigorous, careful, ambitious, and attentive. NOTHING can slip through.

Review target / extra instructions:
$@

Scope:
- If a PR number is provided, review that PR.
- If no PR number is provided, detect the PR for the current branch.
- If no PR exists, review the current branch against the explicit base in the request, otherwise against `main`/`master` as appropriate.

Context-gathering flow:
1. Identify the target and base branch.
   - For PRs, use `gh pr view <number> --json number,title,body,headRefName,baseRefName,commits,headRefOid`.
   - Use the PR's actual `baseRefName`; do not assume `main`.
2. Inspect the change set.
   - Use `git merge-base HEAD origin/<base>` when reviewing the current branch.
   - Inspect `git diff <base-or-merge-base>...HEAD --stat`, `--name-only`, and relevant hunks.
   - Read changed files and nearby unchanged code as needed to understand behavior.
3. Read project guidance if present: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.github/CONTRIBUTING.md`.
4. For PRs, check CI and existing review feedback to avoid duplicates:
   - `gh pr checks <number>`
   - `gh api repos/{owner}/{repo}/pulls/<number>/reviews --jq '.[] | {user: .user.login, state, body}'`
   - `gh api repos/{owner}/{repo}/pulls/<number>/comments --jq 'map({user: .user.login, path, line: (.line // .original_line), body})'`

Review priorities, in order:
1. Correctness bugs, regressions, edge cases, async/concurrency issues, resource leaks.
2. Security, validation, authorization, untrusted input handling, path traversal, command/template injection, secrets.
3. Compatibility risks: public APIs, HTTP behavior, config/schema changes, adapters, deployment/runtime assumptions.
4. Error handling and observability: swallowed errors, misleading errors, panics on recoverable paths, missing context.
5. Tests: missing coverage for changed behavior, especially failure paths and compatibility cases.
6. Documentation only when behavior, API, config, or operational guidance changed.
7. Maintainability only when it materially affects correctness, future safety, or project consistency. Avoid style nits.

Finding rules:
- Only report issues you are confident about.
- Prefer fewer high-signal findings over exhaustive low-value commentary.
- Include file paths and line numbers when possible.
- Explain why the issue matters in Trusted Server's context.
- Suggest a concrete fix.
- Do not flag formatting or subjective style.
- Do not modify files during the review.

Severity:
- P0 / Blocker: must fix before merge; confirmed bug, security issue, data loss, CI-breaking change, severe compatibility break.
- P1 / High: should fix; likely bug, missing validation, race, API/config behavior risk, important test gap.
- P2 / Medium: recommended; plausible edge case, maintainability issue with real cost, docs/test gap for changed behavior.
- P3 / Low: nice-to-have; minor clarity or documentation improvement. Use sparingly.

Output format:

```md
## Review Summary

<Briefly state what was reviewed and the overall risk.>

## Findings

### P0 / Blockers

1. **<title>** — `<file>:<line>`
   - Issue: <what is wrong>
   - Why it matters: <impact>
   - Suggested fix: <specific fix>

### P1 / High
...

### P2 / Medium
...

### P3 / Low
...

## CI / Existing Reviews

<CI status and any existing-review context relevant to your findings.>
```

