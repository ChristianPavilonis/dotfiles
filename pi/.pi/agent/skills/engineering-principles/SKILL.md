---
name: engineering-principles
description: Apply Christian's engineering principles to non-trivial code changes. Use when designing state or boundaries, debugging a defect, changing retry or reconciliation behavior, planning a migration or refactor, reviewing risky behavior, or deciding how to prove implementation work.
---

# Engineering principles

Use the smallest set of principles that changes a real decision. Mechanically obvious edits can follow repository guidance and normal validation without loading every reference.

## Route the work

Read each matching reference completely before planning, editing, or judging the work.

| Work in front of you | Read |
| --- | --- |
| State models, branching behavior, APIs, validation, or code that is hard to trace | [references/design.md](references/design.md) |
| A defect, regression, unexplained runtime behavior, or production symptom | [references/debugging.md](references/debugging.md) |
| Retries, restarts, queues, lifecycle steps, reconciliation, or concurrent writers | [references/operations.md](references/operations.md) |
| A migration, refactor, compatibility change, repeated edit, or multi-step implementation | [references/delivery.md](references/delivery.md) |
| Code was changed, delegated work returned, a risky change is under review, or completion is about to be claimed | [references/verification.md](references/verification.md) |

Several rows may apply. Read all that materially affect the task, but do not load a reference merely to cite it.

## Apply the principles

1. State the intended outcome and the invariant that must hold. For a defect, include the observable failure. This step is complete when success and failure can be distinguished.
2. Turn every loaded reference into a concrete choice about the data shape, boundary, fix location, work sequence, or check. Drop a reference when it does not change the work.
3. Choose the smallest unit that reaches a checkable state. This step is complete when the next edit and its check are both named.
4. Inspect the resulting artifact and run the relevant check. This step is complete when direct evidence shows the intended path works, or the remaining uncertainty is stated plainly.

## Keep the response useful

Explain the decisions and evidence, not the names of the principles. Name a principle only when it caused a meaningful design change, rejected scope, or changed the proof required. A principle cited without changing the work is ceremony.