# Resolve a review target

Treat text supplied after the skill command as an explicit target. Resolve requested files, refs, commits, ranges, or pull requests to concrete comparison points.

Without an explicit target:

1. Review staged, unstaged, and relevant untracked working changes when the worktree is dirty.
2. With a clean worktree, review the open pull request for the current branch at its exact base and head revisions.
3. With no open pull request, review the current branch from its merge base with `main`, then `master`, preferring the matching remote-tracking branch.

Stop when no target can be resolved without guessing. Include whole-file content for relevant untracked files. Exclude generated or ignored files only when repository guidance puts them outside review scope. Inspect committed targets without changing the checkout.

Record inspection commands and a fingerprint that can detect target changes. Use object IDs for committed comparisons. For working changes, account for `HEAD`, status, staged and unstaged diffs, and included untracked content. Keep the fingerprint outside the reviewed worktree.

Done when the target identifies one reproducible set of changes and the fingerprint can be recomputed with the same commands.
