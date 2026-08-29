# Debugging

Use these rules for defects, regressions, and unexplained runtime behavior.

## Reproduce the failure

Make the symptom observable before changing production code when a practical path exists. Capture the triggering input, state, timing, and actual output. Use instrumentation when the path is unclear.

If a reliable reproduction is unavailable or would require disproportionate setup, say why and choose the closest executable observation. Do not turn an uncertain diagnosis into a confident fix.

This step is complete when the failure is executable or the missing evidence is explicit.

## Trace the cause

Follow the bad value or state transition backward until reaching the first place the system violates its intended rule. Inspect actual values and timing. Do not infer them from the final error alone.

A guard that only hides a crash, retry, or invalid state is not a root-cause fix. Put the correction where the invalid state is created, admitted, or misclassified.

Restart-only failures deserve a state check before a code theory. Inspect persisted configuration, caches, locks, serialized state, and partial prior work.

This step is complete when the proposed fix changes the cause rather than only the observed symptom.

## Check the failure class

Search for sibling paths that create or admit the same bad state. Fix the class when the same rule owns every instance. Keep unrelated cleanup outside the change.

Create a regression check that fails on the original behavior when a cheap local test path exists. Otherwise capture the closest scripted or runtime check. Use [verification.md](verification.md) to prove the fix afterward.