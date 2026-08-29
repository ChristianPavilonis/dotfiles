---
description: Review current changes, the whole pull request, the branch, or another exact target
argument-hint: "[target]"
---

Run a read-only self-review with the two custom review agents. Keep the parent session responsible for scope, orchestration, evidence checks, and the final judgment.

Review target:
${@:-automatic current-work review}

## Resolve the target

Resolve the target before delegation. An explicit target overrides all automatic selection.

With an explicit target, resolve the requested files, refs, commits, range, or pull request to concrete comparison points. Record the repository, cwd, refs or files, commands the children should use to inspect the change, and the known request or acceptance criteria. Stop and explain the ambiguity when the target cannot be resolved without guessing.

Without an explicit target, inspect `git status --short` first:

1. If the worktree has staged, unstaged, or untracked changes, review those changes. Inspect both diffs and include untracked source, test, configuration, and documentation files as whole-file additions. Exclude only generated or ignored files that repository guidance identifies as out of scope.
2. If the worktree is clean, look for an open pull request whose head is the current branch. When one exists, review the whole pull request at its exact head and base revisions. Record any mismatch between local `HEAD` and the pull request head rather than silently reviewing another revision.
3. If the worktree is clean and no open pull request exists, compare the current branch with its merge base against `main`, then `master`. Prefer the matching remote-tracking branch when available. Review the complete `base...HEAD` diff.

Stop with a target-resolution error when the worktree is clean and no pull request, `main`, or `master` comparison can be resolved.

## Run both reviewers

Call `subagent({ action: "list" })` first. Confirm `code-smell-reviewer` and `correctness-reviewer` are executable. Stop with a setup error if either is missing, disabled, or restricted.

Launch exactly those two agents together in one top-level `subagent` call with an asynchronous `workflowScript`. Use `runs.all` with stable keys `code-smells` and `correctness`, `context: "fresh"`, and `output: false` for both children. Do not launch another reviewer.

Give both children the same compact target contract. It must contain:

- repository and cwd;
- exact diff scope and inspection commands;
- untracked files included in scope;
- known request, requirements, and acceptance criteria;
- review-only authority;
- the instruction to inspect repository guidance and the diff directly.

Give each child one distinct lane. The code-smell reviewer applies only its fixed catalog. The correctness reviewer checks only concrete changed-behavior defects. The agents must inspect files and commands directly rather than treating the parent conversation or another agent's output as evidence.

Keep the workflow read-only. It must not edit files, apply fixes, create review artifacts in the repository, post comments, commit, or push.

## Judge the results

After both children return, inspect every cited diff location and enough surrounding code to verify the claim. Reject findings that are unsupported, pre-existing, duplicated, outside the target, or assigned to the wrong lane. Resolve conflicts yourself. Child output is evidence, not authority.

Return one concise review:

```md
## Self-review

Reviewed: <resolved worktree, pull request, or branch comparison>

### Fix before completion

1. **[correctness | code smell: <name>] <title>**: `<path>:<line>`
   - Evidence: <verified trigger or matching code shape>
   - Impact: <concrete consequence>
   - Fix: <specific smallest fix>

### Optional

<Valid improvements that should not expand the current change, or "None.">

### Residual risk

<Checks that could not be run and the uncertainty they leave, or "None identified.">
```

Order correctness findings by severity and all findings by practical impact. If no finding survives the parent's evidence check, write `No fixes worth doing now.` under `### Fix before completion`.

This command reviews only. Fixes require a separate user-approved step.
