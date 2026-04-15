---
description: Review the current worktree, branch diff, or another requested change target
---
Review this repository for bugs, regressions, risky assumptions, and missing validation.

Review target:
- If no extra instructions are provided, review the current staged and unstaged worktree changes
- If extra instructions are provided, use them as the review scope instead

Additional review instructions / target override:
$@

Default worktree review flow:
- Inspect `git status --short`
- Inspect `git diff --stat`
- Inspect `git diff --cached --stat`
- Read the relevant diffs for changed files

If the instructions specify another target, choose the appropriate commands and comparison points yourself. Examples:
- current branch against `master`
- current branch against `main`
- PR #123
- a specific commit, range, or merge base

Goals:
- Find bugs, logic mistakes, regressions, and risky assumptions
- Call out missing tests or validation gaps
- Flag unclear naming, dead code, or maintainability issues when they matter
- Prioritize correctness over style nits

Output format:
- Start with a brief summary of what changed and what you reviewed
- Then list findings ordered by severity
- For each finding, include file path(s), the issue, and why it matters
- If there are no meaningful issues, say so explicitly and mention any residual risk

Constraints:
- Do not modify files
- Stay focused on the requested review target
- When the target is ambiguous, make the smallest reasonable assumption and say what you assumed
