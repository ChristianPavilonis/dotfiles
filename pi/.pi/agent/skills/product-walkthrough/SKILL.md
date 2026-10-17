---
name: product-walkthrough
description: Product walkthrough for settling user-facing behavior through one plain-English question at a time and recording each confirmed decision. Use when a feature is ambiguous, a redesign must be reconciled with existing behavior, a UX flow needs definition, or a product brief must be shaped before subtasks or implementation.
disable-model-invocation: true
---

# Product walkthrough

Turn product intent into a documented decision ledger. The user owns behavior. The existing product and repository supply the baseline.

## Process

1. **Anchor the baseline.** Inspect the existing behavior, redesign, notes, and relevant code before interpreting differences. Describe mismatches as facts, then ask the user what they want to retain or change. This step is complete when the baseline and current product scope are explicit.

2. **Choose the ledger.** Use the destination the user names. Otherwise, update an existing task, spec, or product brief that governs the work. If none exists, follow repository instructions and established planning structure; ask for a path when no convention settles it. For an Obsidian destination, load the `obsidian` skill. This step is complete when one document is the source of truth.

3. **Walk the flow.** Start at the first user-visible step and move in the order a user experiences the product. Ask one concise product question per turn. After each answer, update the ledger with the confirmed decision, then continue from that decision. Stay with the current stage until its behavior is settled.

4. **Close the seams.** Ask only follow-ups made relevant by the confirmed flow. Check roles, limits, joining, waiting, disconnect and reconnect, completion, replay, cleanup, mode or platform parity, and features present in the baseline but absent from the new design. Resolve each consequential seam or record it as deferred.

5. **Reconcile the ledger.** Check new answers against earlier decisions and the baseline. When the user changes a decision, replace stale text instead of appending a contradiction. Record explicit scope boundaries separately from confirmed behavior.

6. **Hand off.** Summarize the settled flow, deferred decisions, and out-of-scope work. Ask whether the walkthrough is complete. Create subtasks, specs, plans, or implementation work only after the user confirms or explicitly requests the next artifact.

## Question discipline

- Keep product ownership with the user. Ask what they want rather than prescribing behavior.
- Anchor questions in concrete differences: what existed, what the new artifact shows, and which decision is open.
- Use plain product language. Bring in technical terms only when they constrain the decision.
- Answer factual questions by inspecting the source of truth, then return to the walkthrough.
- Present alternatives only when the user asks for options or an open question cannot expose the distinction clearly.
- Treat a short answer as a decision only when its referent is unambiguous. Ask a focused follow-up when it is not.

## Completion criteria

The walkthrough is complete when:

- every user-visible stage in the requested scope has confirmed behavior;
- consequential edge cases are confirmed or explicitly deferred;
- contradictions are resolved or documented as intentional;
- the ledger matches the conversation and names out-of-scope work; and
- the user confirms that discovery can stop or asks for the next artifact.
