## Delegated Pi models

Before delegating Pi work, read `~/.pi/agent/settings.json`. Use `subagents.defaultModel` for implementation, debugging, design, and reviews. Use `subagents.agentOverrides.scout.model` for lightweight scouting, lookups, and mechanical tasks. Honor an explicit user model request.

Check the selected exact `provider/model-id` in `pi --list-models` and pass it explicitly with `--model` or the delegation tool's `model` field. Configuration is authoritative over remembered model names, agent profiles, and package examples. Correct unrequested stale model choices to the configured tier automatically.

If the lightweight model is unavailable or rejected at launch, use the configured default model. If the default or an explicitly requested model cannot launch, do the subtask in the current session. Keep working without a model-selection approval prompt, and mention any fallback in the next progress update.

## Obsidian Vault

You may read and edit `~/Documents/MyObsidianVault/` to capture ideas, project work, and items the user wants to revisit.

For **all** vault work, load the `obsidian` skill. It routes to the focused reference for Markdown, project-note structure, Bases, or the Obsidian CLI.

For maintained projects, folder structure is authoritative: create and edit project work only under `Projects/<Project>/` in the appropriate `docs/`, `notes/`, `tasks/`, `specs/`, `plans/`, or `logs/` folder. Use the `obsidian` skill for project specs and implementation plans as well as all other project notes. Follow its project-note requirements; do not add `project`, `type`, or `tags` properties to project notes.

Use `Notes/` for durable non-project knowledge. Daily notes may capture work completed today, but project records belong in their project directory.

Use mermaide charts when explaining how things work and flow. (prefer top to bottom flows)

## Other guidelines

Don't use python for scripting, favor repo conventions, or use bash, or use js with bun for more expressive tasks.
