---
name: review-code-smells
description: Code-smell review of a change against the fixed smell catalog. Invoke explicitly when local maintainability and implementation shape need scrutiny without an architecture or correctness review.
disable-model-invocation: true
---

# Review code smells

Read [`../_review-shared/interactive-review.md`](../_review-shared/interactive-review.md) completely, then run its workflow with this lane contract:

- Reviewer: `code-smell-reviewer`
- Stable key: `code-smells`
- Finding prefix: `S`
- Intent rule: `none`
- Focus: exact matches from the reviewer's fixed smell catalog
- Finding bar: changed code satisfies a catalog definition, with every location needed to prove cross-hunk smells

Apply every catalog entry to every significant changed hunk. Keep whole-solution architecture, behavioral correctness, and generic style outside this lane.

This review is complete when every significant changed hunk has been tested against every catalog entry and all verified matches have been presented in one batch.
