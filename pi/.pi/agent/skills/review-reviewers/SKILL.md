---
name: review-reviewers
description: check latest reviews in github and review the comments adversarially
disable-model-invocation: true
---


First get the latest reviews for this pull request and look at the open pending reviews.

Next gather whatever additional information that can be helpful, like the pull request description-related issues, documentation, etc.

Next take a look at each review comment and look at the code it's related to. 
Determine if that is a legitimate issue, bug, or nitpick. 
Remember that these reviewers are often very flawed and will not fully understand the context or the intent of the pull request.
Push back on things that fundamentally change the behavior of the pull request.

Ask the user for clarification if you don't have all the context.

when all is clear respond with a summary of what should be accepted feedback, pushed back on or followed up on or clarified.
