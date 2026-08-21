## Obsidian Vault

You may read and edit `~/Documents/MyObsidianVault/` to capture ideas, project work, and items the user wants to revisit.

For **all** vault work, load the `obsidian` skill. It routes to the focused reference for Markdown, project-note structure, Bases, or the Obsidian CLI.

For maintained projects, folder structure is authoritative: create and edit project work only under `Projects/<Project>/` in the appropriate `docs/`, `notes/`, `tasks/`, `specs/`, `plans/`, or `logs/` folder. Use the `obsidian` skill for project specs and implementation plans as well as all other project notes. Follow its project-note requirements; do not add `project`, `type`, or `tags` properties to project notes.

Use `Notes/` for durable non-project knowledge. Daily notes may capture work completed today, but project records belong in their project directory.

Use mermaide charts when explaining how things work and flow.

## Subagent Model Routing

When delegating with `pi-subagents`, prefer `openai-codex/gpt-5.6-terra` for routine, high-volume grunt work (scouting, focused reviews, straightforward implementation, and validation). Prefer `openai-codex/gpt-5.6-sol` for genuinely complex work: difficult debugging, architecture or design decisions, broad synthesis, or high-risk changes. Pass the choice explicitly through the subagent `model` field when practical; this is a routing preference, not an absolute requirement.
