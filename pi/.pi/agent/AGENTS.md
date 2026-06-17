


## Obsidian Vault

You have permission to read and edit files in the obsidian vault, this is for you to jot 
ideas down and things that the user wants to think about later.

While using the obsidian vault remember to use the json-canvas, obsidian-bases, obsidian-markdown, and obsidian-note-types skills.

Vault location: ~/Documents/MyObsidianVault/

### Projects

The vault uses Obsidian Bases to organize notes by project. Each project has its own `.base` file in `Bases/` that filters on the `project` frontmatter field. There is also a `Projects Overview.base` that shows all notes grouped by project.

| Project | Slug (frontmatter value) | Base File |
|---------|--------------------------|-----------|
| Rigzilla | `rigzilla` | `Bases/Rigzilla.base` |
| Trusted Server | `trusted-server` | `Bases/Trusted Server.base` |
| Scrapezilla | `scrapezilla` | `Bases/Scrapezilla.base` |
| Tauri Tutorials | `tauritutorials` | `Bases/Tauri Tutorials.base` |
| Ideas | `ideas` | `Bases/Ideas.base` |
| YesMan | `yesman` | `Bases/YesMan.base` |
| HotTakes | `hottakes` | `Bases/HotTakes.base` |

When creating notes, **always set the `project` frontmatter** to one of the slugs above so the note appears in the correct base. See the obsidian-markdown skill for the full template.

### Note types

Project notes use a semantic `type` field. Use the `obsidian-note-types` skill when choosing or creating note types.

- `project` — Project home/index notes, durable project overviews, MOCs
- `task` — Concrete action items with outcome/checklist; replaces new uses of `todo`
- `issue` — Bugs, blockers, risks, production problems, unresolved concerns
- `plan` — Proposed implementation steps, project plans, migration plans, handoff plans
- `reference` — Durable facts: APIs, architecture, commands, schemas, source-backed explanations
- `log` — Work/session summaries, progress updates, daily/project activity records
- `scratch` — Messy temporary thinking, rough drafts, parking-lot notes
- `note` — General durable notes that do not fit a more specific type

### Daily notes
this is where you can place notes from what's being worked on today.
The user may want you to log some things we did today, or notes for later.

### Notes
This is where notes and documentation that we want to use later will be stored.

