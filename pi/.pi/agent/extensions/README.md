# Extensions

Put TypeScript extensions here, for example:

- custom tools
- commands like `/foo`
- event hooks
- UI widgets or overlays
- custom providers
- safety checks or permission gates

Typical files:
- `my-extension.ts`
- `my-extension/index.ts`

Current local extensions include:
- `commit.ts` — `/commit [instructions]` spawns a background forked pi agent on `openai-codex/gpt-5.3-codex-spark` to inspect changes and create one local git commit
- `daily-work-log.ts` — appends one JSONL record per non-extension user input to `~/.pi/agent/logs/YYYY-MM-DD.jsonl`
- `note.ts` — `/note <prompt>` spawns a background forked pi agent to write/update an Obsidian note without interrupting the current session
- `session-title.ts` — auto-generates an untitled new session's display name after the first prompt using `openai-codex/gpt-5.3-codex-spark`
- `model-harpoon.ts` — opens a model picker on Alt+M
- `thinking-harpoon.ts` — opens a descending thinking-level picker on Alt+T
