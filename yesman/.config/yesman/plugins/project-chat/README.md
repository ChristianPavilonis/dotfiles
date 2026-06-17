# Project Chat

Durable project-focused chat UI for Yesman.

This plugin uses Yesman's durable harness/session primitives:
`ctx.harness.sessions`, `ctx.harness.get`, `ctx.harness.events`, versioned KV
updates, and the host SSE replay endpoint.

Routes:

- `/plugins/project-chat` — project index
- `/plugins/project-chat/<project>?thread=<id>` — project chat thread

The plugin stores threads/messages in plugin KV, starts Pi harness runs for
assistant turns, streams output through the host SSE endpoint, and finalizes
terminal runs back into message history.
