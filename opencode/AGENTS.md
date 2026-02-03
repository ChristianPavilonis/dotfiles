
## General rules

- Do not ask about backwards compatability, 90% of the time it is not an issue, I will bring it up first
- Never perform destructive git operations (ie. commit, push, pull, etc.)
  - Always let me review your changes as unstaged changes and let me manage my own git worktree / staging area



## Obsidian Vault

You have permission to read and edit files in the obsidian vault, this is for you to jot 
ideas down and things that the user wants to think about later.

While using the obsidian vault remember to use the json-canvas, obsidian-bases, obsidian-markdown skills.

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

When creating notes, **always set the `project` frontmatter** to one of the slugs above so the note appears in the correct base. See the obsidian-markdown skill for the full template.

### Note types

Each project base has views filtered by `type`:

- `note` — General notes, research, documentation
- `scratch` — Quick scratchpad, rough drafts
- `todo` — Task lists and action items

### Daily notes
this is where you can place notes from what's being worked on today.
The user may want you to log some things we did today, or notes for later.

### Notes
This is where notes and documentation that we want to use later will be stored.

### Searching
Use fzf and rg to search for what you need to find


