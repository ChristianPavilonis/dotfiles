# Pi

This package holds my local Pi customizations and is meant to be linked into `~/.pi` with GNU Stow.

## Layout

- `settings.json` — Pi's global defaults, like theme, compaction, retries, and resource discovery.
- `keybindings.json` — Custom keyboard shortcuts.
- `extensions/` — TypeScript extensions that add tools, commands, hooks, UI, or custom providers. Example: `model-leader.ts` for a `ctrl+x` model palette.
- `prompts/` — Markdown prompt templates you can run with `/name`.
- `skills/` — Skill directories containing `SKILL.md` plus any helper scripts or references.
- `themes/` — JSON theme files for Pi's TUI colors.

## Notes

- Keep machine- or project-specific tweaks here when I want Pi to behave differently from the defaults.
- Stow only the durable config files here (`settings.json`, `keybindings.json`, `extensions/`, `prompts/`, `skills/`, `themes/`).
- Leave runtime state out of the repo: `~/.pi/agent/auth.json`, `~/.pi/agent/sessions/`, and similar local cache/state files should stay unmanaged.
- Pi also supports optional files like `AGENTS.md` and `SYSTEM.md` under `~/.pi/agent/` if I want to add them later.
- After changing files here, run the repo's `./install` script again to refresh symlinks.
