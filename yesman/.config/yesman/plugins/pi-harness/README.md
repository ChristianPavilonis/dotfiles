# pi-harness

Global Yesman plugin that registers the `pi` harness backed by Pi RPC.

It also provides a tiny `pi.ask` event handler so the harness can be smoke-tested without writing a second plugin.

Start Yesman from any project directory:

```bash
yesman up
```

Inspect the plugin/harness:

```bash
yesman plugin list
yesman harness list
```

Ask Pi a question:

```bash
yesman emit pi.ask '{"prompt":"Say hello from the Pi harness.","tools":[]}'
yesman logs
yesman events
```

Other plugins can call the harness directly with:

```ts
const result = await ctx.harness.run("pi", {
  prompt: "Summarize this project.",
  cwd: ".",
});
```
