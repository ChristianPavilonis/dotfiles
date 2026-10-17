---
name: review-reviewers
description: Assess GitHub PR review feedback. Bring decisions to the user with options and trade-offs, flag changes to PR intent, and batch inconsequential fixes for approval.
disable-model-invocation: true
---

# Review reviewers

Assess review requests against the PR's intent, then help the user choose a response.

## Read the feedback

1. Fetch the PR's current review summaries and threads. Include pending reviews where accessible and disclose retrieval gaps.
2. Establish the PR's intent and scope from its description, diff, and linked context. For each active request, read the relevant code and tests. Investigate disputed premises or missing evidence when they could change your recommendation.
3. Group feedback by requested change. Merge duplicates, split requests the user can decide separately, and consider conflicting comments together. Keep source links for the decision brief. Mention resolved, outdated, or informational comments only when they still affect an active request.

Done when every active request has been considered against the PR's intent and relevant implementation, with material uncertainties identified.

## Present a decision brief

Respond in chat. Open with the PR link and a short statement of its intent. Mention coverage gaps that limit the assessment.

### Decisions

Bring requests with meaningful consequences or trade-offs to the user as decisions. Include disputed requests and requests whose consequences remain uncertain. Put changes to PR intent or scope first.

For each decision, give:

- Request and source link.
- Consequences, affected users or systems, and any change to PR intent.
- Viable options and trade-offs.
- Recommendation, reason, and main downside. If evidence is missing, name the check needed to choose.

Keep entries short. Distinguish known consequences from assumptions and reviewer suggestions from your own alternatives. Group related decisions, but make clear which choices can be made independently.

### Routine changes

Summarize inconsequential nits and mechanical fixes in one short line or a compact batch. These must preserve behavior, contracts, and PR intent, have no meaningful trade-off, and be independent of unresolved decisions. Routine means inconsequential, not merely easy.

Give individual detail only when it helps the user understand the batch. If there are no decisions, say so and summarize the routine changes without inventing options.

Done when every active request is covered by a decision or the routine batch, each decision has options and a recommendation or a targeted investigation, and the user can see what their approval would authorize.

## Act after approval

Wait for approval before making changes. Approval authorizes the routine batch and the substantive options the user selects. Clarify ambiguous selections; leave unresolved decisions untouched.

Use the conversation's decisions and conditions when implementing. If the feedback or code has materially changed, check whether the approval still applies. Ask again when a change introduces new consequences or trade-offs.

Posting GitHub replies and resolving threads require authorization separate from approval to change code. After acting, summarize completed changes, relevant checks, and remaining decisions.
