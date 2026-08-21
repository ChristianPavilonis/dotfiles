---
description: Review a Trusted Server pull request without delegating
---
Review only the requested Trusted Server pull request. Establish the exact revision, trace every changed behavior through its callers and consumers, validate high-risk paths, and report only actionable issues introduced by the change. Do not modify files or delegate the review.

Review target / extra instructions:
$@

Target rules:
- If a PR number is provided, review that pull request.
- Otherwise, find the open pull request for the current branch.
- If no open pull request exists, stop and report that no PR was found. Do not fall back to a branch or worktree review.
- If the requested PR cannot be inspected, stop and report the reason.

Review flow:

1. Lock the pull request revision.
   - For a numbered PR, run:
     `gh pr view <number> --json number,title,body,url,headRefName,headRefOid,baseRefName,baseRefOid,commits`
   - Without a number, run:
     `gh pr list --head "$(git branch --show-current)" --state open --json number --limit 2`
     Then inspect the selected PR with `gh pr view`.
   - Record the PR number, title, head SHA, base SHA, head branch, and base branch.
   - Compare `git rev-parse HEAD` with the PR head SHA. If they differ, do not silently review the wrong revision. Fetch or inspect the exact PR revision if possible; otherwise stop and report the mismatch.

2. Read repository guidance.
   - Read applicable `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and `.github/CONTRIBUTING.md` files, including guidance in directories containing changed files.
   - Read project's documentation, scripts, and configuration when they define behavior relevant to the change.
   - Treat repository guidance and configuration as authoritative. Do not replace it with assumptions.

3. Inspect the exact change set.
   - Ensure the PR base object is available locally, then inspect:
     - `git diff <base-sha>...<head-sha> --stat`
     - `git diff <base-sha>...<head-sha> --name-only`
     - the complete relevant diff hunks
   - Check `git status --short` so local modifications cannot be mistaken for PR content.
   - Read every changed file and enough unchanged code to understand its contracts and behavior.
   - For every significant hunk, identify affected callers, consumers, data flows, error paths, configuration, tests, and deployment or runtime assumptions.
   - Compare the implementation with the PR description, commits, existing tests, and analogous code where that clarifies intent.
   - Do not consider this step complete until every changed file and significant hunk has an understood purpose and review result.

4. Check validation and existing feedback.
   - Run `gh pr checks <number>` and inspect relevant failing or skipped checks. Do not treat green CI as proof that the change is correct.
   - Inspect existing review bodies, inline comments, replies, unresolved threads, and issue comments. Use pagination where supported:
     - `gh api --paginate repos/{owner}/{repo}/pulls/<number>/reviews`
     - `gh api --paginate repos/{owner}/{repo}/pulls/<number>/comments`
     - `gh api --paginate repos/{owner}/{repo}/issues/<number>/comments`
   - Do not repeat an existing finding unless the new review adds materially different evidence or impact.
   - Inspect the project’s available test, type-check, lint, build, and integration commands. Run the narrowest relevant checks when feasible and report the exact commands and results.

Review priorities, in order:
1. Correctness bugs, regressions, broken invariants, edge cases, async or concurrency issues, and resource leaks.
2. Security, authorization, validation, untrusted input, path traversal, command or template injection, and secret handling.
3. Compatibility risks involving public APIs, HTTP behavior, config or schema changes, adapters, persistence, deployment, and runtime assumptions.
4. Error handling and observability, including swallowed errors, misleading errors, unrecoverable panics, missing context, and unsafe retries.
5. Tests that fail to protect a concrete changed behavior or failure path.
6. Documentation or operational guidance when the change alters behavior, APIs, configuration, or deployment.
7. Maintainability only when it creates a real correctness, safety, or consistency risk. Do not report style preferences.

Finding rules:
- Report only issues introduced or newly exposed by this pull request. Mention pre-existing concerns as residual risk, not as findings.
- Report only actionable issues supported by the code, tests, documentation, or command output.
- Prefer a small number of high-signal findings over exhaustive speculation.
- For each finding, identify the triggering input or condition, the affected code path, the concrete impact, and a specific fix.
- A test gap is a finding only when you can name the changed behavior or failure path that remains unprotected and explain why existing checks do not cover it.
- Include an exact repository-relative path and line number. Prefer a changed line so the finding can be posted inline on GitHub. Put cross-cutting findings in the review body.
- Do not report formatting, naming preferences, subjective style, or hypothetical risks without a credible trigger.
- Do not modify files during the review.

Severity:
- P0 / Blocker: confirmed severe security issue, data loss, authorization bypass, production outage, or severe compatibility break that must block merging.
- P1 / High: likely correctness or security bug, race, important validation failure, or significant API, config, or runtime risk that should be fixed before merging.
- P2 / Medium: credible edge case, recovery or observability problem, compatibility concern, or concrete test gap with meaningful but limited impact.
- P3 / Low: minor correctness or operational improvement with limited impact. Use sparingly and omit style-only suggestions.

Output format:

```md
## Review summary

PR #<number>: <title>

Reviewed `<head-sha>` against `<base-sha>`. <Brief summary of the change and overall risk.>

## Findings

### P0 / Blockers

1. **<short title>**: `<path>:<line>`
   - Issue: <specific trigger and what the code does>
   - Impact: <concrete consequence in Trusted Server>
   - Evidence: <relevant test, code path, or command result>
   - Suggested fix: <specific fix>

### P1 / High

...

### P2 / Medium

...

### P3 / Low

...

## Validation and review context

- Checks run: <commands and results>
- CI: <relevant status and failures>
- Existing feedback: <relevant comments or "No duplicate findings found">
- Residual risk: <remaining uncertainty, or "None identified">
```

Omit empty severity sections. If there are no meaningful findings, say so explicitly under `## Findings` and still report validation, CI, existing-feedback, and residual-risk context.
