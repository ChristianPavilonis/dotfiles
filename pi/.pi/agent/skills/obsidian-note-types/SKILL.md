---
name: obsidian-note-types
description: Classify and create Obsidian project notes using Christian's semantic note types  project, task, issue, plan, reference, log, scratch, and note. Use when writing or updating notes in the Obsidian vault for project tracking, knowledge capture, or AI-agent work logs.
---

# Obsidian Note Types

Use this skill with `obsidian-markdown` when creating or updating notes in `~/Documents/MyObsidianVault`.

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

- `rigzilla`
- `trusted-server`
- `scrapezilla`
- `tauritutorials`
- `ideas`
- `yesman`

If unclear, use `project: ideas`.

## Type vocabulary

Choose the most specific type that fits:

| Type | Use for |
|---|---|
| `project` | Project home/index notes, durable project overviews, MOCs. |
| `task` | Concrete action items with a desired outcome and checklist. Replaces new uses of `todo`. |
| `issue` | Bugs, blockers, risks, production problems, unresolved concerns. |
| `plan` | Proposed implementation steps, project plans, migration plans, agent handoff plans. |
| `reference` | Durable facts: APIs, architecture, commands, schemas, source-backed explanations. |
| `log` | Work/session summaries, progress updates, daily/project activity records. |
| `scratch` | Messy temporary thinking, rough drafts, parking-lot notes. |
| `note` | General durable notes that do not fit a more specific type. |

Prefer `reference` over `note` when the content should be reused later as factual documentation. Prefer `plan` over `task` when the content is a sequence of work rather than one action.

## Status vocabulary

Use simple lowercase statuses:

- `draft` — rough or incomplete.
- `open` — needs action or resolution.
- `active` — currently being worked.
- `blocked` — cannot progress without something else.
- `done` — completed or captured.
- `current` — durable note/reference believed valid.
- `archived` — no longer active but kept for history.

Suggested defaults:

| Type | Default status |
|---|---|
| `project` | `active` |
| `task` | `open` |
| `issue` | `open` |
| `plan` | `draft` |
| `reference` | `current` |
| `log` | `done` |
| `scratch` | `draft` |
| `note` | `current` |

## Template files

Prefer these vault templates when creating notes manually or emulating their structure:

- `templates/Project Home.md` → `type: project`
- `templates/Project Task.md` → `type: task`
- `templates/Project Issue.md` → `type: issue`
- `templates/Project Plan.md` → `type: plan`
- `templates/Project Reference.md` → `type: reference`
- `templates/Project Log.md` → `type: log`
- `templates/Project Scratch.md` → `type: scratch`
- `templates/Project Note.md` → `type: note`

## Links section

Created notes should end with:

```markdown
#### Links
```

Add related wikilinks there when obvious; otherwise leave the section empty.
