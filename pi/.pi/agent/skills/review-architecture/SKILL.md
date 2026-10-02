---
name: review-architecture
description: Review a code change when the user specifically requests architecture, intent alignment, boundary design, or solution simplification. Use the review skill for a general or multi-lane code review.
---

# Review architecture

Read [`../_review-shared/interactive-review.md`](../_review-shared/interactive-review.md) completely, then run its workflow with this lane contract:

- Reviewer: `solution-reviewer`
- Reviewer instructions: [solution-reviewer.md](../../agents/solution-reviewer.md)
- Stable key: `architecture`
- Finding prefix: `A`
- Intent rule: `confirm`
- Focus: solution shape, responsibility, boundaries, state, invariants, coupling, ordering assumptions, change surface, abstractions, and contracts
- Finding bar: direct evidence that the target drifts from confirmed intent, creates a brittle dependency, changes an unnecessary contract, or has a smaller shape that preserves required behavior

Account for the complete change rather than isolated hunks. A simplification must name what it removes and what capability or flexibility it gives up.

This review is complete when every significant changed boundary and responsibility has been tested against the confirmed intent and all verified findings have been presented in one batch.
