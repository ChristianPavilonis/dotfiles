---
description: Review the current repo's staged and unstaged changes
---
Review this repository's current local changes.

Start by inspecting:
- `git status --short`
- `git diff --stat`
- `git diff --cached --stat`
- the relevant diffs for changed files

Goals:
- Find bugs, logic mistakes, regressions, and risky assumptions
- Call out missing tests or validation gaps
- Flag unclear naming, dead code, or maintainability issues when they matter
- Prioritize correctness over style nits

Output format:
- Start with a brief summary of what changed
- Then list findings ordered by severity
- For each finding, include file path(s), the issue, and why it matters
- If there are no meaningful issues, say so explicitly and mention any residual risk

Constraints:
- Do not modify files
- Stay focused on the current staged and unstaged worktree changes
