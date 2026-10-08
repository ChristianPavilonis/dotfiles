# Worker review

Use this workflow only for an assignment explicitly marked `Review mode: worker`. The coordinator owns target resolution, intent assessment, final verification, reporting, and user decisions. Inspect this lane directly and return candidates to the coordinator. Leave further delegation to the coordinator.

## Accept the contract

Read the assigned lane skill completely. Require its contract plus a coordinator-supplied repository and cwd, exact comparison points and inspection commands, included untracked files, target fingerprint and recomputation commands, known intent and requirements, repository guidance, and review-only authority.

For an `infer` lane, use the supplied stated or inferred intent and source context without requiring user confirmation. If a missing requirement or competing interpretation would materially change a finding, report the blocking question to the coordinator. User questions belong to the coordinator.

Recompute the fingerprint before inspection. Report a mismatch or incomplete contract as blocked rather than resolving a different target. Read applicable repository instructions from the target checkout.

Done when the supplied target matches the fingerprint and the lane has enough intent context to inspect it.

## Inspect directly

For a lane with reviewer instructions, read that linked file completely and apply its review process, domain rules, and finding bar. Its agent configuration is for launching that named agent, not for this worker; use this workflow's authority and output format. For a local lane, use the inspection method in the skill.

Cover the lane's completion criteria against the entire supplied target. Keep the checkout unchanged. Run only narrow, safe checks in non-fixing modes; report unavailable checks as coverage gaps.

Keep candidates introduced or newly exposed by the target that meet the lane's finding bar. Cite every location needed to establish a cross-hunk claim. Pre-existing issues and missing safety proof alone are residual risk, not findings.

Recompute the fingerprint after inspection. If it changed, return `Target changed` with the mismatch and let the coordinator restart the review.

Done when the lane's required coverage is complete, or each uncovered part has a named blocker, and every candidate has direct evidence.

## Return the result

Return one result to the coordinator using the lane's finding prefix:

```markdown
## <lane> result

Status: complete | blocked | target changed
Target: <exact comparison points and fingerprint>
Coverage: <files, behaviors, boundaries, or catalog entries inspected; gaps>

### <ID>. <title>

- Issue: <trigger or matching code shape and concrete consequence>
- Evidence: `<path>:<line>` and the code, traced path, or exact check result
- Scope: <affected components and consumers>
- Intent and contracts: <what the proposed change preserves or changes>
- Proposed change: <smallest concrete fix>
- Tradeoff: <capability given up, or "None identified">
- Severity: <when supported by the lane's rules>

Checks: <exact commands actually run and outcomes, or "None run">
Residual risk: <unproven safety claims, next checks, and other uncertainty>
Questions: <blocking questions for the coordinator, or "None">
```

When no candidates survive, replace the finding entries with `No findings.` Preserve any safety proof required by the reviewer instructions under residual risk, including evidence level, status, and next check.

Done when the coordinator has the result, including explicit gaps and check outcomes. End the review here. Fixes, GitHub actions, and user approval prompts belong to the coordinator.
