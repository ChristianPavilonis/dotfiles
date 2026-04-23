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
- `daily-work-log.ts` — appends one JSONL record per non-extension user input to `~/.pi/agent/logs/YYYY-MM-DD.jsonl`
