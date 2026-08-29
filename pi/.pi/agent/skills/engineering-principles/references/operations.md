# Operations

Use these rules for retries, restarts, queues, lifecycle steps, reconciliation, and concurrent work.

## Make operations converge

A repeated operation should reach the same correct state regardless of prior partial work. Ask what happens when it runs twice and when the prior run stops after each mutation.

Prefer stable identities, upserts, checkpoints, content comparisons, and explicit reconciliation over creation order or assumptions about a clean start. Startup should detect and repair stale locks, abandoned work, and incomplete state when the system owns that recovery.

This part is complete when re-execution after every meaningful interruption converges without duplicate effects or manual cleanup.

## Define retry ownership

Name which layer retries, which failures qualify, what identifies the attempt, and how duplicate side effects are prevented. One layer should own the policy. Other layers should return enough information for that owner to decide.

A retry loop is incomplete without a stopping rule and an observable final failure.

## Separate writers before coordinating them

When concurrent actors may write the same file, branch, record, key, or object, first look for a natural ownership split. Give each actor an independent target and combine results at one explicit boundary.

Use locking or serialization only when the shared target is genuinely indivisible. A lock around avoidable shared state preserves the design problem.

This part is complete when every mutable target has one clear owner at a time and the composition point is explicit.