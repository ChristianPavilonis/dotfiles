# Interactive review workflow

Each review skill supplies a lane contract with a reviewer or local inspection method, finding prefix, intent rule, focus, and finding bar. Follow this workflow for that lane only.

## Resolve the target

Treat text supplied after the skill command as an explicit target. Resolve requested files, refs, commits, ranges, or pull requests to concrete comparison points.

Without an explicit target:

1. Review staged, unstaged, and relevant untracked working changes when the worktree is dirty.
2. With a clean worktree, review the open pull request for the current branch at its exact base and head revisions.
3. With no open pull request, review the current branch from its merge base with `main`, then `master`, preferring the matching remote-tracking branch.

Stop when no target can be resolved without guessing. Include whole-file content for relevant untracked files. Exclude generated or ignored files only when repository guidance puts them outside review scope.

Record inspection commands and a fingerprint that can detect target changes. Use object IDs for committed comparisons. For working changes, account for `HEAD`, status, staged and unstaged diffs, and included untracked content.

Done when the target identifies one reproducible set of changes.

## Establish intent

Apply the lane's intent rule:

- `confirm`: explain the implemented behavior and inferred outcome briefly, then ask the user whether that is the intended change. Continue after confirmation.
- `infer`: derive intent from the user request, pull request, linked issues, tests, and documentation. Ask one blocking question only when competing interpretations would change the findings.
- `none`: inspect the target without an intent checkpoint.

Done when the lane has enough intent context to distinguish a finding from an unsupported preference.

## Inspect the lane

Build a compact target contract containing the repository and cwd, exact target and commands, included untracked files, known intent and requirements, repository guidance, review-only authority, lane focus, and finding bar.

For a delegated lane:

1. Call `subagent({ action: "list" })` and confirm the lane's reviewer is executable.
2. Launch that reviewer in one top-level `subagent` call with `async: true`. Use a `workflowScript` containing one `runs.run` with the lane's stable key, reviewer, target contract, `context: "fresh"`, and `output: false`.
3. Inspect the target yourself while the reviewer runs. When it returns, verify every cited location and enough surrounding code to establish the claim.

For a local lane, perform the inspection method named by the skill and collect candidate findings directly.

Accept a candidate only when it is introduced or newly exposed by the target, belongs to the lane, and meets the lane's finding bar. Reject unsupported, pre-existing, duplicate, and out-of-scope candidates. Recompute the fingerprint before reporting; restart the lane if the target changed.

Done when every candidate has been accepted or rejected against direct evidence.

## Report the batch

Present every accepted finding in one report. Use the lane prefix for stable IDs:

```md
## <lane> review

Reviewed: <exact target>
Intent: <confirmed or inferred intent, when relevant>

### <ID>. <title>

- Issue: <plain-language explanation>
- Evidence: `<path>:<line>` and the code or behavior that establishes the finding
- Scope: <affected files, components, tests, documentation, migrations, or consumers>
- Intent and contracts: <what the proposed change preserves, changes, or breaks>
- Proposed change: <smallest concrete change that addresses the finding>
- Tradeoff: <capability or flexibility the change gives up, or "None identified">
```

Only accepted findings belong in the report. When none survive, report `No findings.` End by asking the user to reference IDs and choose what to fix, defer, leave as-is, or investigate. Wait for their batch decision.

## Act on the decision

Expand a finding when the user asks for more context. Apply only fixes the user approves, within the scope they approved. Run the narrow applicable checks after edits and summarize changed files and results.

Record deferred and unchanged findings in the user's terms. A later invocation can review the updated target again.
