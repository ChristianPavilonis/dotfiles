---
name: gh-open-pr
description: open/update a pr on github and follow the guidelines
disable-model-invocation: true
---

Open a pull request or update the description using `gh` and follow guidelines for the description

<principles>

## Title

The title of the PR should be very clear, not loaded with jargon, explaining the intent of the pr

## Summary

Summarize the changes and explain why these changes were made, and what the issue was.

list the files that were changed, and in one sentence explain what the change was in that file.

## Scope

Explain the scope of the PR and why it's the size that it is.

</principles>


<notes>
  Remember: the pr description is for humans, make sure this is digestible, and not overloaded with jargon or acronyms without definitions

  Ideally there is a Closes #<issue> tag

  and if there's a pull request template in the repo please follow that as well as follwing the principles
</notes>
