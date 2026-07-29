# Project Notes

Use this reference whenever creating or updating a project note in `~/Documents/MyObsidianVault`.

## Project structure

A project is identified by its path, not frontmatter. Project work belongs only in these maintained project directories:

| Project | Directory | Home note | Dashboard |
|---|---|---|---|
| Rigzilla | `Projects/Rigzilla/` | `Projects/Rigzilla/Rigzilla.md` | `Rigzilla Dashboard.base` |
| Scrapezilla | `Projects/Scrapezilla/` | `Projects/Scrapezilla/Scrapezilla.md` | `Scrapezilla Dashboard.base` |
| Trusted Server | `Projects/Trusted Server/` | `Projects/Trusted Server/Trusted Server.md` | `Trusted Server Dashboard.base` |
| Tauri Tutorials | `Projects/Tauri Tutorials/` | `Projects/Tauri Tutorials/Tauri Tutorials.md` | `Tauri Tutorials Dashboard.base` |
| YesMan | `Projects/YesMan/` | `Projects/YesMan/YesMan.md` | `YesMan Dashboard.base` |
| HotTakes | `Projects/HotTakes/` | `Projects/HotTakes/HotTakes.md` | `HotTakes Dashboard.base` |

Each project has these category folders:

| Folder | Use for |
|---|---|
| `docs/` | Evergreen documentation, durable references, and operating knowledge. |
| `notes/` | General notes, scratch work, and temporary thinking. |
| `tasks/` | Todos, issues, bugs, investigations, and other tracked outcomes. |
| `specs/` | Feature specifications, designs, and requirements while work is being defined or built. |
| `plans/` | Implementation plans for tasks and specs. |
| `logs/` | Dated work logs and progress summaries. |

Do not create project work in `Notes/`, `daily/`, the vault root, or directly under `Projects/`. Do not infer a project from a general note. If the project is unclear or is not in this table, ask the user where it belongs.

`Ideas` and older clusters such as Fliq are not part of this project system.

## Required frontmatter

Every project note, including a project home, must include these required properties:

```yaml
---
created: YYYY-MM-DD HH:mm
status: open
---
```

- Do **not** add `project`, `type`, or `tags`; the directory is authoritative.
- Do not add tags to project notes.
- Preserve meaningful optional properties already present, such as `aliases`, `priority`, or a completion date.
- Use `created`, not `created at`.

## Status vocabulary

Use only:

- `draft` — incomplete definition or rough material
- `open` — needs action or resolution
- `active` — currently valid or being worked
- `blocked` — cannot progress without another dependency
- `done` — completed or captured
- `archived` — retained history that is no longer active

Suggested defaults:

| Location | Default status |
|---|---|
| Project home | `active` |
| `docs/` | `active` |
| `notes/` | `draft` |
| `tasks/` | `open` |
| `specs/` | `draft` |
| `plans/` | `draft` |
| `logs/` | `done` |

Completed tasks, specs, and plans remain in their folders. At the user's request, extract durable knowledge from a spec into `docs/`; preserve the original spec as a historical record.

## Naming

- Project home filenames match their project name, e.g. `Projects/Rigzilla/Rigzilla.md`, so `[[Rigzilla]]` remains a natural link.
- Do not include a project or note-category prefix in a filename when its directory already supplies that context. For example: `Projects/Rigzilla/tasks/Fix Frontend Guardrails.md`, not `Rigzilla Task - Fix Frontend Guardrails.md`.
- Use descriptive title-case filenames unless an established project convention requires otherwise.
- Logs must begin with their date: `YYYY-MM-DD - Summary.md`.

## Relationships

Every created project note must end with a final `## Related` section. Use ordinary typed wikilink bullets, not frontmatter relationship properties:

```markdown
## Related

- Spec: [[Feature Specification]]
- Task: [[Implement Feature]]
- Plan: [[Feature Implementation Plan]]
- Doc: [[Durable Feature Documentation]]
```

Add only meaningful known relationships. In particular:

- A task should link to its governing spec or plan when one exists.
- A plan should link to the task and/or spec it implements.
- Do not duplicate reverse links solely for symmetry; Obsidian backlinks provide them.
- Preserve useful existing relationship links when editing a note.

## Templates

Use the destination-specific templates in `templates/`:

- `Project Home.md`
- `Project Doc.md`
- `Project Note.md`
- `Project Task.md`
- `Project Spec.md`
- `Project Plan.md`
- `Project Log.md`

Templater assigns these templates automatically when a note is created inside one of the category folders. The Project Home template is for a new project's root note only.

## Dashboards

Each project home embeds views from its directory-filtered `<Project> Dashboard.base`. Do not add project/type/tag metadata to make a Base work. Update the relevant Base only when a new view is genuinely needed.
