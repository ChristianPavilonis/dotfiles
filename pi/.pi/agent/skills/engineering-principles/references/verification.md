# Verification

Use these rules before accepting changed code, delegated work, or a risky review conclusion.

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

Treat an agent summary as a map to the evidence. Read the diff and affected files, run or confirm the reported checks, and inspect generated artifacts. Verify the current repository state because a later edit or commit may have changed the target while review was running.

## Preserve useful proof

Prefer an existing regression test or a small rerunnable check. Keep a new script when the project will use it again or when a reviewer needs to reproduce the evidence. A one-time command is enough for a one-time question.

Report the exact checks run, their outcomes, and any path that could not be exercised. Unavailable proof remains residual risk, not a pass.