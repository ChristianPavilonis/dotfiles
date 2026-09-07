---
name: review-style
description: Style review of changed code using repository formatting, lint, naming, readability, and local convention evidence. Invoke explicitly when code style is the concern.
disable-model-invocation: true
---

# Review style

Read [`../_review-shared/interactive-review.md`](../_review-shared/interactive-review.md) completely, then run its local-lane workflow with this contract:

- Reviewer: none; inspect locally
- Finding prefix: `T`
- Intent rule: `none`
- Focus: repository formatting, lint, naming, readability, and established local conventions
- Finding bar: a target-caused tool failure or a direct inconsistency with a convention demonstrated by repository guidance or nearby code

Read repository guidance and discover applicable commands from the project. Run narrow read-only formatting, lint, and static-analysis check modes. Use nearby code as evidence for conventions that tooling does not encode.

Apply the shared batch format to every verified finding. Add a short list of exact check commands and outcomes after the findings.

This review is complete when every changed file has been covered by each applicable check or demonstrated convention and all verified findings have been presented in one batch.
