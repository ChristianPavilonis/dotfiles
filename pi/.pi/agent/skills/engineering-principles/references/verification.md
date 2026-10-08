# Verification

Use these rules before accepting changed code, delegated work, or a risky review conclusion.

## Schedule checks by stage

Choose checks for a behavioral change, not each individual edit. A stable checkpoint is a coherent tested state with no further edits planned for the behavior being checked.

| Stage | Required verification |
| --- | --- |
| Editing | The smallest check that distinguishes correct from broken behavior. |
| Completed behavioral unit | The focused regression plus affected neighboring tests. |
| Stable integration checkpoint and completion | Relevant broader suites, lint, formatting, and build checks against the combined state. |

Run broader checks at these checkpoints, not automatically after every focused pass. Rerun affected checks when relevant code, dependencies, configuration, fixtures, or environment change, when a failure needs investigation, or when repository guidance requires them. Unrelated edits do not invalidate all evidence. Explicit task gates and repository requirements still apply; scheduling reduces repetition, not required coverage.

## Prove the real path

Compilation and static checks are necessary when relevant, but they do not prove runtime behavior. Exercise the changed path through the closest real interface and inspect its output or side effect.

Match the check to the risk:

- data logic needs representative inputs and boundary cases;
- persistence needs the stored state read back;
- retries and reconciliation need repeated or interrupted execution;
- integrations need the communication path exercised;
- user-facing behavior needs the user path driven;
- compatibility changes need a real consumer or fixture checked.

This part is complete when the evidence observes the behavior the change claims to provide.

## Prove the safety assumption

For the highest-risk changed behavior, identify at most two facts its safety depends on. If the change has no materially risky behavior, record that and skip the evidence ladder.

Push each fact as far down this ladder as is cheap and safe:

1. **Source:** cite the exact implementation, dependency source, or contract.
2. **Path:** trace the bad case and show whether execution can reach it.
3. **Executed:** run a focused test or scratch script against the code that ships.
4. **Runtime:** reproduce the behavior through its intended application or integration path.

A fact is proven only when Executed or Runtime evidence directly tests it. Mark Source or Path evidence as `unproven` and name the cheapest next check. Missing proof is residual risk, not a finding, unless inspection establishes a credible defect trigger and impact.

Report each fact with its highest evidence level, evidence, status, and the next check when unproven. Keep cleared risks separate from confirmed findings. A plausible explanation does not clear a risk.

## Inspect delegated work directly

Treat an agent summary as a map to the evidence. Read the diff and affected files, inspect actual check output and generated artifacts, and compare the tested state with the current target. Apply the evidence reuse rules below rather than rerunning a check solely because another agent executed it.

## Reuse current evidence

Accept an existing check when its exact command, result, tested revision or relevant file fingerprint, and environment are known and still apply. Include uncommitted and untracked inputs in the tested state where relevant. A log alone does not establish which code it tested.

Rerun affected checks when relevant inputs changed, evidence is incomplete, or a suspected defect needs reproduction. Reuse proof only for the behavior and inputs it exercised; a focused pass does not replace missing integration coverage.

For substantial coordinated work, keep a compact record: `Check | tested state | result | elapsed time | log`. Use the existing handoff or validation record rather than creating a separate ledger for a small change.

## Handle known baseline failures

Reproduce an unrelated baseline failure once and retain its command, tested state, failure signature, and evidence that it predates the change. Subsequent validation may isolate affected checks, with exclusions disclosed. Revisit the baseline failure when relevant code or environment changes, its failure signature changes, or its classification becomes uncertain.

An excluded failing suite remains a coverage gap. Report the affected checks that passed and the known failure separately rather than claiming the entire suite passed.

## Preserve useful proof

Prefer an existing regression test or a small rerunnable check. Keep a new script when the project will use it again or when a reviewer needs to reproduce the evidence. A one-time command is enough for a one-time question.

Report the exact checks run, their outcomes, and any path that could not be exercised. Unavailable proof remains residual risk, not a pass.