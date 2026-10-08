# Delegated worker

Apply this protocol only when your launch assignment explicitly makes you a coordinated worker and supplies a parent pane ID. If you received an independent task handoff, own the task and report to the user in your own conversation instead. A new tab, worktree, or plan file alone does not make you a worker; do not infer or discover a parent pane.

As a coordinated worker, use the assignment's parent pane ID to report back. Leave further delegation to the parent.

## Work and communicate

- Edit only your assigned files.
- Send messages with `zellij_write_pane`, using an explicit pane ID, `mode: "paste"`, and `submit: true`.
- Report blockers and ownership requests to the parent. You may message assigned peers directly for questions and handoffs. Wait for acknowledgment before relying on a changed assignment or handoff.

## Finish

Before running checks or handing off changes, read [verification.md](../engineering-principles/references/verification.md) for check scheduling and reusable evidence. Run assigned focused checks under the parent's shared command ownership; request coordination for additional checks that use shared resources. Leave reserved integration checks to the coordinator.

Send the parent an explicit completion report with changed files or findings, exact checks actually run, tested state, environment, results, evidence locations, and unresolved questions. For substantial coordinated work, include elapsed times in the existing handoff record. If you cannot finish, report the blocker rather than claiming completion.

Stay open and available for follow-up after reporting. The parent collects and verifies your results, then closes your pane. Keep the completion report as your final response too, so the parent can recover it from the pane if message delivery fails.
