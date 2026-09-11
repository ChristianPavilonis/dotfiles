---
name: review-reviewers
description: Produce a concise Obsidian report from GitHub PR feedback. Separate mechanical fixes from consequential requests, recommend an approach, and leave decisions for the user to record inline.
disable-model-invocation: true
---

# Review reviewers

Assess reviewer claims as hypotheses rather than authority. Produce a report instead of a comment-by-comment chat. Recommend an approach; the user owns the decision.

## Prepare

1. Fetch the PR's latest review summaries and threads, including pending reviews visible through GitHub. Preserve each comment's author, link, location, and state. Disclose retrieval gaps.
2. Read the PR intent, relevant code, tests, and linked context. Check each request's premise and impact on behavior and contracts. Name missing evidence explicitly.
3. Group comments by requested change. Merge duplicates with all source links, split independently decidable requests, and show conflicts together. Assign stable IDs such as `R1`. Account briefly for resolved, outdated, and informational feedback without treating it as a fresh request.

Done when every fetched comment maps to a request or an accounting note, and each request has supporting evidence or a named uncertainty.

## Write the report

Keep the opening to one short paragraph identifying the PR link, reviewed head commit, review timestamp, intended behavior, category counts, and any coverage gaps. Use exactly two request categories.

### Mechanical fixes

Include only verified, bounded fixes that preserve behavior, contracts, and PR intent, introduce no meaningful trade-off, and are independent of unresolved decisions. Small implementation effort alone does not qualify a request. Put uncertain or disputed requests in **Decisions required**.

Use one compact bullet per fix: ID, source and location, proposed change, and why it is mechanical. Group these for batch consideration; classification is not approval.

### Decisions required

Include policy choices, behavior or compatibility changes, scope expansion, altered PR intent, competing approaches, and uncertain consequences. Put policy and intent decisions first; link dependencies.

Use the entry below. Prefer short bullets and roughly 150 words per entry, expanding only for material consequences. State the affected scope and consumers, whether PR intent changes, and the main trade-off against accepting. Separate evidence from assumptions. If the reviewer proposed no fix, label any inferred approach.

Recommend accept, reject, or defer for each entry, with a brief reason and the main downside or uncertainty. When evidence is insufficient, recommend a specific investigation rather than inventing confidence. Keep recommendations separate from the user's decision. Every report must include at least one grounded recommendation; if there are no consequential requests, give a brief overall recommendation supported by the review.

```markdown
### R1. Requested change

Source: [Reviewer](URL) · `file:line` · review state

- Request: ...
- Evidence: ...
- Consequences: affected scope, intent or contract impact, main trade-off.
- Recommendation: ... because ... Main downside or uncertainty: ...

#### Your decision

Decision:
```

## Save and stop

Load the `obsidian` skill and its Markdown and project-note references. Save the report in the owning project's `notes/` directory using those conventions. Ask for the destination if the project is unclear. Include brief comment accounting notes and keep empty request categories visible.

Before updating a report, reread it. Preserve IDs and user-written decisions, rationale, and conditions. Give new requests new IDs. Flag materially changed evidence or requests for renewed confirmation beside the original decision.

Done when every fetched comment is accounted for, every active request is classified, consequential entries have recommendations and decision fields, and the report is saved. Return its path, category counts, and coverage limitations. Stop for the user's inline decisions; undecided entries do not block completion.

## Follow-up when requested

Reread the report before acting. Blank or `undecided` entries remain undecided. Clarify ambiguous decisions and materially changed requests before acting on them.

Recommendations and recorded acceptance are not execution instructions. Make code changes, post GitHub replies, or resolve threads only when explicitly requested, within the user's decisions and conditions. Record completed actions separately from decisions.
