---
name: gather-requirements
description: Use before planning or implementation when a request is ambiguous, underspecified, or has multiple plausible outcomes. Turn it into a small, user-confirmed intent.
disable-model-invocation: true
---

# Gather requirements

Use this skill before detailed planning or implementation. Stay in requirements gathering until the user confirms the intent.

1. Restate the request in plain language. Identify the desired outcome, affected area, constraints, and any ambiguity.
   Done when you can name the behavior the user wants and the uncertainty blocking work.

2. Ask only questions whose answers would change scope, behavior, or acceptance. Treat use cases as desired outcomes, not as a required feature shape.
   Done when every blocking question has an answer or the user has chosen a default.

3. Propose one concrete sentence describing the intended result. If the request contains independent goals, separate them or defer the extras.
   Done when the sentence distinguishes the desired result from nearby alternatives.

4. Ask the user to confirm or correct the sentence. If they correct it, return to step 2.
   Done when the user confirms the intent.
