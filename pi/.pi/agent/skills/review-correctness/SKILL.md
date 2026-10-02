---
name: review-correctness
description: Review a code change when the user specifically requests correctness, security, compatibility, or regression checks. Use the review skill for a general or multi-lane code review.
---

# Review correctness

Read [`../_review-shared/interactive-review.md`](../_review-shared/interactive-review.md) completely, then run its workflow with this lane contract:

- Reviewer: `correctness-reviewer`
- Reviewer instructions: [correctness-reviewer.md](../../agents/correctness-reviewer.md)
- Stable key: `correctness`
- Finding prefix: `C`
- Intent rule: `infer`
- Focus: request violations, branches, boundaries, state transitions, failure paths, concurrency, security, compatibility, error handling, and concrete test gaps
- Finding bar: a credible trigger, an affected execution path, and a concrete impact introduced or newly exposed by the target

Trace materially changed behavior through relevant callers, consumers, state, and contracts. The user-facing batch contains verified findings in the shared format.

This review is complete when every materially changed behavior has been traced far enough to accept or reject concrete defects and all verified findings have been presented in one batch.
