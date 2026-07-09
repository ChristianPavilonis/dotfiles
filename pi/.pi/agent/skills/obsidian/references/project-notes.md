# Project Notes

Use this reference whenever creating or updating a project note in `~/Documents/MyObsidianVault`.

## Required frontmatter

Every project note must include:

```yaml
---
created at: YYYY-MM-DD HH:mm
project: ideas
type: note
status: current
tags: []
---
```

`project` must be one of:

| Project | Slug | Base file |
|---|---|---|
| Rigzilla | `rigzilla` | `Bases/Rigzilla.base` |
| Trusted Server | `trusted-server` | `Bases/Trusted Server.base` |
| Scrapezilla | `scrapezilla` | `Bases/Scrapezilla.base` |
| Tauri Tutorials | `tauritutorials` | `Bases/Tauri Tutorials.base` |
| Ideas | `ideas` | `Bases/Ideas.base` |
| YesMan | `yesman` | `Bases/YesMan.base` |
| HotTakes | `hottakes` | `Bases/HotTakes.base` |

If unclear, use `project: ideas`.

## Type vocabulary

Choose the most specific type that fits:

| Type | Use for | Default status |
|---|---|---|
| `project` | Project home/index notes, durable project overviews, MOCs | `active` |
| `task` | Concise action items with a desired outcome | `open` |
| `issue` | Bugs, blockers, risks, production problems, unresolved concerns | `open` |
| `plan` | Proposed implementation steps, migrations, and handoff plans | `draft` |
| `reference` | Durable facts: APIs, architecture, commands, schemas, source-backed explanations | `current` |
| `log` | Work/session summaries, progress updates, daily/project activity | `done` |
| `scratch` | Messy temporary thinking, rough drafts, parking-lot notes | `draft` |
| `note` | General durable notes that fit no more specific type | `current` |

Prefer `reference` over `note` for reusable factual documentation, and `plan` over `task` for a sequence of work.

## Status vocabulary

- `draft` — rough or incomplete
- `open` — needs action or resolution
- `active` — currently being worked
- `blocked` — cannot progress without something else
- `done` — completed or captured
- `current` — durable and believed valid
- `archived` — retained for history, no longer active

## Templates

Prefer these vault templates when creating notes manually or emulating their structure:

- `templates/Project Home.md`
- `templates/Project Task.md`
- `templates/Project Issue.md`
- `templates/Project Plan.md`
- `templates/Project Reference.md`
- `templates/Project Log.md`
- `templates/Project Scratch.md`
- `templates/Project Note.md`

## Links section

Created notes must end with:

```markdown
#### Links
```

Add obvious related wikilinks there; otherwise leave it empty.

The Bases filter notes by `project` and `type`, so these properties must be present and valid.
