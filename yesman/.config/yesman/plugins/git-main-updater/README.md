# git-main-updater

Scheduled YesMan plugin that updates `main`/`master` branches for direct child git repositories under `~/projects` without using a harness.

## Behavior

- Registers a daily schedule: `30 6 * * *` (6:30 AM in the machine's local timezone).
- Handles `git-main-updater.update`.
- Discovers direct child git repositories in `/home/christian/projects`.
- Runs `git fetch --prune origin` in each repo.
- Updates `main` and `master` when present:
  - If the branch is currently checked out, it runs `git pull --ff-only origin <branch>` only when the worktree is clean.
  - If the branch is not checked out, it runs `git fetch origin <branch>:<branch>` so the local branch fast-forwards without switching branches.
- Emits `git-main-updater.update.completed` or `git-main-updater.update.failed` with per-repo results.

## Manual run

```bash
yesman emit git-main-updater.update '{}'
```

With overrides:

```bash
yesman emit git-main-updater.update '{"projectsRoot":"/home/christian/projects","branches":["main","master"],"concurrency":2}'
```

## Optional config

```bash
yesman config set git-main-updater projects_root '"/home/christian/projects"'
yesman config set git-main-updater branches '["main","master"]'
yesman config set git-main-updater concurrency 2
```
