---
name: obsidian
description: Work with Christian's Obsidian vault: create or edit project notes, use Obsidian Markdown and wikilinks, manage semantic note metadata, configure Bases, or operate Obsidian through its CLI. Load the task-specific reference before acting.
---

# Obsidian

Use this skill for any work in `~/Documents/MyObsidianVault/`. Load only the reference(s) needed for the request before editing or running commands.

## Routing

| Request | Read first |
|---|---|
| Create or edit a vault Markdown note; syntax such as wikilinks, embeds, callouts, properties, or tags | [references/markdown.md](references/markdown.md) and [references/project-notes.md](references/project-notes.md) |
| Select a note type, project slug, status, template, or create a task, plan, issue, reference, log, or daily note | [references/project-notes.md](references/project-notes.md) |
| Create or edit a `.base` file; build table, card, list, map, filter, formula, or summary views | [references/bases.md](references/bases.md) |
| Search, read, create, append to, or manage notes through a running Obsidian app; develop a plugin or theme | [references/cli.md](references/cli.md) |

For a request spanning categories, read every applicable reference. For example, a project note that should appear in a Base requires both `markdown.md` and `project-notes.md`; changing a Base requires `bases.md`.

## Guardrails

- The vault is `~/Documents/MyObsidianVault/`.
- When creating a project note, follow `project-notes.md` exactly: include its required frontmatter and final `#### Links` section.
- Do not use the Obsidian CLI unless Obsidian is running; use filesystem tools for direct file edits.
- Keep the detailed rules in the references instead of duplicating them here.
