---
name: review-reviewers
description: Human-led walkthrough of GitHub PR review comments. Use when the user wants to inspect reviewer feedback one comment at a time, understand each proposed fix and its scope, and make every disposition themselves.
disable-model-invocation: true
---

# Review reviewers

The user owns every decision. Fetch the evidence, explain it, and record the user's choice. Assess reviewer claims as hypotheses rather than authority. Present consequences without choosing or recommending a disposition.

## Prepare the review

1. Identify the pull request. Fetch its latest review summaries and threads, including unresolved comments and pending reviews visible through GitHub. Label resolved, outdated, and duplicate comments rather than silently dropping them.

   Done when every fetched comment has an author, link, location when applicable, and review state.

2. Gather the context needed to assess the comments. Read the PR description, linked issues and documentation, the changed code and nearby behavior, and relevant tests. Identify the PR's intended behavior and any contracts it introduces, changes, or relies on, such as APIs, schemas, configuration, persisted data, events, CLI behavior, and documented compatibility.

   Done when each comment's factual premise can be checked against the code and stated intent, or the missing context can be named precisely.

3. Tell the user how many comments need decisions, then start with the first one. Keep the rest in a queue rather than presenting the whole analysis at once.

## Work one comment at a time

For the current comment:

1. Show the reviewer, link, file and line, and the relevant text.
2. Explain the concern in plain language. Include only the code and PR context needed to understand it. Separate facts supported by the code from assumptions or missing context.
3. Explain the reviewer's suggested fix as concrete code or behavior changes. If the reviewer did not suggest a fix, say so.
4. State the scope of that fix, including affected files, components, tests, documentation, migrations, or consumers that can be identified from the repository.
5. State explicitly whether the fix would preserve or change the PR's intent. Name any contract it would alter or break and who relies on that contract. If the impact cannot be established, name the uncertainty.
6. Ask the user what decision to record. Neutral choices may include address it, reply or push back, defer it, investigate it, or skip it. Wait for the user's answer before moving to another comment.

If a decision depends on context only the user has, ask one focused question and continue with the same comment after they answer.

Record the user's decision and rationale in their words. Carry out code changes, GitHub replies, or thread resolution only when the user explicitly asks for that action. After any requested action, report what happened and return to the next undecided comment.

## Finish

After every comment has a decision or the user has explicitly skipped it, return a decision ledger containing:

- the comment and link
- the user's decision
- any requested follow-up
- intent or contract impact
- unresolved questions

Mark undecided items as undecided. The ledger reflects the user's choices and does not replace them with a recommended outcome.
