---
name: review-architecture
description: Architecture review of a code change for intent alignment, brittle boundaries, unnecessary scope, contract churn, and simpler solution shapes. Invoke explicitly when the solution as a whole needs scrutiny.
disable-model-invocation: true
---

# Review architecture

Read [`../_review-shared/interactive-review.md`](../_review-shared/interactive-review.md) completely, then run its workflow with this lane contract:

- Reviewer: `solution-reviewer`
- Stable key: `architecture`
- Finding prefix: `A`
- Intent rule: `confirm`
- Focus: solution shape, responsibility, boundaries, state, invariants, coupling, ordering assumptions, change surface, abstractions, and contracts
- Finding bar: direct evidence that the target drifts from confirmed intent, creates a brittle dependency, changes an unnecessary contract, or has a smaller shape that preserves required behavior

Account for the complete change rather than isolated hunks. A simplification must name what it removes and what capability or flexibility it gives up.

This review is complete when every significant changed boundary and responsibility has been tested against the confirmed intent and all verified findings have been presented in one batch.
