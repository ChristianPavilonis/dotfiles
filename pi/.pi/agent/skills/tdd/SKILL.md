---
name: tdd
description: Use when the user asks for TDD or a regression test, or when a bug has an obvious cheap local test target. Establish failing-before evidence, make the smallest fix, and prove the check passes afterward. Skip when the available test path is unclear, expensive, integration-heavy, or weak.
license: MIT, see LICENSE
---

# TDD bug fix

Make the broken behavior executable before changing production code when a clear, cheap regression path exists. Prefer the narrowest check that proves the intended behavior.

## Workflow

1. **Define the regression.** Identify the intended behavior, current behavior, affected path, and smallest observable reproduction.
   Complete when one executable check can distinguish the bug from the intended result.

2. **Choose the narrowest useful check.** Prefer the nearest existing unit, component, integration, or regression harness for that code path.
   Complete when the check exercises behavior rather than mirroring implementation details.

3. **Make it fail.** Add the smallest focused regression test and run it before editing production code. Correct the test if it passes or fails for an unrelated reason.
   Complete when the recorded failure demonstrates the reported bug.

4. **Fix the cause.** Make the smallest production change that restores the intended behavior while preserving nearby contracts.
   Complete when the regression check passes.

5. **Check the neighborhood.** Run the adjacent tests, type checks, lint, build, or scenario checks justified by the changed path.
   Complete when the relevant checks pass or each remaining failure is characterized.

## When a failing test is impractical

State why failing-before evidence is not worth its setup cost. Use the closest executable proof instead, such as a focused script, browser journey, request trace, log assertion, snapshot comparison, or manual reproduction command. Run the proof before and after the fix when possible.

Prefer no new test over a test that mostly checks mocks, depends on unrelated global state or timing, requires broad fixture churn, or would be deleted after the fix.

## Guardrails

- Encode intended behavior, not the current implementation.
- Preserve strong existing assertions unless the approved behavior changed.
- Keep the regression focused on the bug.
- Make flaky checks deterministic before trusting them.
- After proving the reported instance, look for sibling cases only when the same failure shape has a credible path.

## Handoff

Report:

- the failing-before command and the failure it produced;
- the passing-after command;
- nearby validation and its result; and
- the substitute proof and reason when failing-before evidence was impractical.
