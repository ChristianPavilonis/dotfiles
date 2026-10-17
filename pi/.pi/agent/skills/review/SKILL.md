---
name: review
description: Coordinate a general code review of working changes, a branch, commits, or a pull request. Delegate correctness, architecture, code-smell, and style inspections, then verify and synthesize one review. Use a specialist skill for a single requested lane; use review-reviewers to assess existing GitHub feedback.
---

# Review

Own one target, one evidence-backed intent summary, and one final report. The specialist skills own their lane rules. Review-only authority permits inspection and safe checks; code edits and GitHub actions require a later explicit request.

## Prepare the review

1. Read [target.md](../_review-shared/target.md) completely and resolve the target once.
2. Establish intent from the user request, PR, linked issues, applicable repository guidance, tests, documentation, and changed code. Use the user's stated outcome when available; otherwise infer the outcome from that evidence. Briefly state the intent and proceed directly to review without a confirmation prompt. Ask a blocking question only when unresolved competing interpretations would materially change the findings.
3. Read each selected lane skill from the table below. Select all four by default; honor an explicit subset and state omitted lanes in the report.
4. Build one target contract with the repository and cwd, exact comparison points and inspection commands, included untracked files, fingerprint and recomputation commands, stated or inferred intent and source links, requirements, repository guidance, and review-only authority.

| Lane | Skill |
| --- | --- |
| Correctness | [review-correctness](../review-correctness/SKILL.md) |
| Architecture | [review-architecture](../review-architecture/SKILL.md) |
| Code smells | [review-code-smells](../review-code-smells/SKILL.md) |
| Style | [review-style](../review-style/SKILL.md) |

Done when every selected lane can inspect the same reproducible target with enough intent context to distinguish findings from unsupported preferences.

## Dispatch independent inspections

Use [zellij-delegation](../zellij-delegation/SKILL.md), read completely, to launch and manage one read-only Pi worker per selected lane. Read-only review assignments may overlap in the same checkout. Resolve all instruction paths to absolute paths before sending them.

After the delegation workflow's worker instruction, each assignment must include:

```text
Review mode: worker
Read <absolute lane SKILL.md path> completely and follow its worker workflow.
Assignment: inspect only <lane> and return candidates to the coordinator.
<shared target contract>
<parent pane ID>
```

The worker workflow is [worker-review.md](../_review-shared/worker-review.md). It performs inspection directly, without another reviewer launch or a user approval prompt. Start the independent workers before collecting their results. While they run, inspect changed contracts, callers, and tests that will help verify their claims.

If Zellij delegation is unavailable, run the selected lanes sequentially in the main agent using the same worker workflow and contract. Disclose local execution instead of claiming independent agents. A worker failure is a coverage gap, not a clean lane; retry with a corrected assignment or complete that lane locally when possible.

Done when every selected lane has an explicit result or a disclosed blocker. Follow the delegation workflow to collect and release owned worker panes after verification and any needed follow-up.

## Verify and synthesize

1. Recompute the target fingerprint. If it changed, discard results for the old target and restart preparation. Ask before restarting repeatedly when the checkout keeps changing.
2. Check every candidate against cited code and enough surrounding paths, contracts, or check output to establish its premise and consequence. Retain only target-caused claims meeting their originating lane's finding bar. Record unresolved evidence as uncertainty rather than a verified finding.
3. Merge candidates describing the same underlying issue, preserving lane attribution and supporting evidence. Keep independently actionable issues separate. Agent agreement is not additional proof.
4. When recommendations conflict, compare them against the established intent and contracts. Recommend the smallest change that addresses the verified issue. If the choice depends on user policy or missing evidence, keep one entry with the alternatives, trade-offs, and a specific question or next check.
5. Order findings by concrete impact and urgency. Distinguish behavioral defects from architecture changes and maintenance or style suggestions. Preserve supported lane severity without inventing bug severity for a preference.
6. Recompute the fingerprint immediately before reporting. Restart if it changed.

Done when every candidate is accepted, merged, rejected, or recorded as unresolved, and accepted findings have verified evidence against the unchanged target.

## Report once

Use stable IDs `R1`, `R2`, and so on for this batch. Present one report, not four concatenated lane reports:

```markdown
## Review

Reviewed: <exact target>
Intent: <stated or inferred outcome>
Coverage: <selected lanes, execution mode, and incomplete or omitted coverage>

### R1. <title>

- Kind: <behavioral defect | architecture | maintenance | style>; <originating lanes>
- Issue: <concrete trigger or code shape and consequence>
- Evidence: `<path>:<line>` and supporting code, path, or check result
- Scope: <affected files, components, and consumers>
- Recommendation: <smallest concrete change, with alternatives when unresolved>
- Intent and trade-offs: <contract or intent effects and capability given up>

Checks: <exact commands actually run and outcomes>
Residual risk and open questions: <unproven safety claims, coverage gaps, next checks>
```

Use as many entries as verified findings require. When none survive, say `No verified findings.` Keep coverage gaps and unresolved claims visible even in a no-findings report. Preserve material safety proof and its evidence level from the correctness lane; a passing check proves only what it exercised.

End with one request for the user to reference IDs and choose what to fix, defer, leave as-is, or investigate. Wait for their batch decision. Recommendations alone are not approval to act.

Done when the user has one evidence-backed review of the exact target, honest coverage and check outcomes, and one decision prompt.

## Follow up

Expand findings on request. Make changes or post GitHub feedback only when explicitly requested, within the user's approved scope and conditions. Recheck the target and affected evidence before acting on an older review. Run the narrow applicable checks after approved edits and summarize changed files and results.
