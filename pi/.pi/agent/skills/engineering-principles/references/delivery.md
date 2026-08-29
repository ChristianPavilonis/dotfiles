# Delivery

Use these rules for migrations, refactors, compatibility changes, repeated edits, and multi-step implementation.

## Subtract before adding

Remove dead paths, obsolete validators, duplicated state, and unused compatibility code before building on the same area. Deletion must be inside the approved scope and backed by current callers or contracts.

Do not add parsers, migration machinery, retries, or extension points without a current requirement. Each one creates another input and failure path to maintain.

This part is complete when the new behavior builds on the smallest base that still satisfies current contracts.

## Sequence verifiable units

Split the work into the smallest units that end in a meaningful check. Establish the baseline, make one change, run its check, and only then continue. A repeated edit is not one unit merely because the edits look alike.

Order delivery so a reviewer can follow the proof. Useful sequences include a failing regression before its fix, a baseline before a migration, removal before replacement, and a stable data shape before behavior that depends on it.

This part is complete when each unit can be checked independently and a failed check identifies the unit that caused it.

## Treat compatibility as a contract

Inventory callers and consumers before retaining or deleting an old path. When all callers are internal and a coordinated break is approved, migrate them and remove the old API in the same change. When external, staged, or versioned consumers exist, preserve the rollout contract instead of applying an internal-cleanup rule blindly.

Temporary adapters need a named removal condition. An adapter without one becomes a second permanent path.