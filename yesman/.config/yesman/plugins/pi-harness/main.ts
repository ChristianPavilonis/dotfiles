import { definePlugin } from "@yesman/sdk";

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

export default definePlugin((plugin) => {
  plugin.harness("pi", {
    kind: "pi_rpc",
    cwd: ".",
    thinking: "off",
  });

  plugin.on("system.started", async (ctx, event) => {
    await ctx.log("pi harness registered", {
      harness: "pi",
      loadedPlugins:
        (event.payload as { loaded_plugins?: string[] }).loaded_plugins ?? [],
    });
  });

  plugin.on("pi.ask", async (ctx, event) => {
    const payload = event.payload as {
      prompt?: unknown;
      cwd?: unknown;
      tools?: unknown;
      thinking?: unknown;
    };

    const prompt = asString(payload.prompt, "Say hello from the Pi harness.");

    await ctx.log("pi.ask received", { prompt });

    const result = await ctx.harness.run("pi", {
      prompt,
      cwd: asString(payload.cwd, "."),
      thinking: asString(payload.thinking, "off"),
      tools: asStringArray(payload.tools),
    });

    await ctx.log("pi.ask completed", {
      outputText: result.outputText,
      toolCallCount: result.toolCalls.length,
    });

    await ctx.emit({
      type: "pi.answer",
      payload: {
        prompt,
        outputText: result.outputText,
        toolCalls: result.toolCalls,
      },
    });
  });
});
