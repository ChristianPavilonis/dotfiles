# Interactive review workflow

Each review skill supplies a lane contract with a reviewer or local inspection method, finding prefix, intent rule, focus, and finding bar.

When the assignment explicitly says `Review mode: worker`, read [worker-review.md](worker-review.md) completely and follow that workflow instead. Otherwise follow the interactive workflow below for this lane only.

## Resolve the target

Read [target.md](target.md) completely and resolve one reproducible target before continuing.

## Establish intent

Apply the lane's intent rule:

- `infer`: use the user's stated outcome when available; otherwise derive intent from the pull request, linked issues, repository guidance, tests, documentation, and changed code. Briefly state the intent and proceed directly to inspection without a confirmation prompt. Ask one blocking question only when unresolved competing interpretations would materially change the findings.
- `none`: inspect the target without an intent checkpoint.

Done when the lane has enough intent context to distinguish a finding from an unsupported preference.

## Inspect the lane

Build a compact target contract containing the repository and cwd, exact target and commands, included untracked files, fingerprint and recomputation commands, known intent and requirements, repository guidance, review-only authority, lane focus, and finding bar.

For a delegated lane with the `subagent` tool available:

1. Call `subagent({ action: "list" })` and confirm the lane's reviewer is executable.
2. Launch that reviewer in one top-level `subagent` call with `async: true`. Use a `workflowScript` containing one `runs.run` with the lane's stable key, reviewer, target contract, `context: "fresh"`, and `output: false`.
3. Inspect the target yourself while the reviewer runs. When it returns, verify every cited location and enough surrounding code to establish the claim.

When `subagent` is unavailable, read the lane's linked reviewer instructions completely and apply its review process and domain rules directly to the resolved target. Use this workflow's batch format and disclose local execution.

For a local lane, perform the inspection method named by the skill and collect candidate findings directly.

Accept a candidate only when it is introduced or newly exposed by the target, belongs to the lane, and meets the lane's finding bar. Reject unsupported, pre-existing, duplicate, and out-of-scope candidates. Recompute the fingerprint before reporting; restart the lane if the target changed.

Done when every candidate has been accepted or rejected against direct evidence.

## Report the batch

Present every accepted finding in one report. Use the lane prefix for stable IDs:

```md
## <lane> review

Reviewed: <exact target>
Intent: <stated or inferred intent, when relevant>

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
