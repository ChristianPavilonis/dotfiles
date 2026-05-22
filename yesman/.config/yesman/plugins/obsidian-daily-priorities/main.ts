import { definePlugin } from "@yesman/sdk";

const DEFAULT_VAULT_PATH = "/Users/christian/Documents/MyObsidianVault";
const DEFAULT_DAILY_FOLDER = "daily";
const DEFAULT_MAX_TASKS = 12;

function localDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function buildPrompt(options: {
  vaultPath: string;
  dailyFolder: string;
  date: string;
  maxTasks: number;
}): string {
  const dailyPath =
    `${options.vaultPath}/${options.dailyFolder}/${options.date}.md`;

  return `You are updating Christian's Obsidian vault.

Vault path: ${options.vaultPath}
Daily note path: ${dailyPath}
Date: ${options.date}

Goal: create or update today's daily note with a generated priorities section based on open/active task notes.

Instructions:
1. Inspect the vault for project task notes with frontmatter \`type: task\` and \`status: open\` or \`status: active\`.
2. Also consider obvious unchecked Markdown tasks (\`- [ ]\`) in project/task notes when they represent current work.
3. Summarize the most relevant ${options.maxTasks} priorities, grouped by project when useful.
4. Update only this managed block in the daily note:

<!-- yesman-priorities:start -->
## Priorities

<!-- generated content goes here -->
<!-- yesman-priorities:end -->

5. If the managed block already exists, replace only the content from \`<!-- yesman-priorities:start -->\` through \`<!-- yesman-priorities:end -->\`.
6. If the daily note exists but does not have the managed block, insert the block near the top of the note, preserving all existing user-written content.
7. If the daily note does not exist, create it. Use Obsidian Markdown. Include frontmatter with \`project: ideas\`, \`type: log\`, \`status: done\`, and \`tags: [daily, priorities]\`, then add the priorities block, a \`## Notes\` section, a \`## today's log\` section, and previous/next day navigation links.
8. Use wikilinks to task notes when possible.
9. Do not delete or rewrite unrelated daily-note content.
10. Do not ask follow-up questions; perform the update and report the file path plus a concise summary of changes.`;
}

export default definePlugin((plugin) => {
  plugin.schedule("daily-priorities", "0 7 * * *", {
    type: "obsidian.daily-priorities.update",
    payload: { reason: "daily schedule" },
  });

  plugin.on("system.started", async (ctx) => {
    await ctx.log("obsidian daily priorities plugin ready", {
      event: "obsidian.daily-priorities.update",
      schedule: "daily-priorities",
      cron: "0 7 * * *",
    });
  });

  plugin.on("obsidian.daily-priorities.update", async (ctx, event) => {
    const payload = event.payload && typeof event.payload === "object"
      ? event.payload as {
        date?: unknown;
        vaultPath?: unknown;
        dailyFolder?: unknown;
        maxTasks?: unknown;
      }
      : {};

    const vaultPath = asString(
      payload.vaultPath,
      (await ctx.config.get<string>("vault_path")) ?? DEFAULT_VAULT_PATH,
    );
    const dailyFolder = asString(
      payload.dailyFolder,
      (await ctx.config.get<string>("daily_folder")) ?? DEFAULT_DAILY_FOLDER,
    );
    const date = asString(payload.date, localDateString());
    const maxTasks = asPositiveInteger(
      payload.maxTasks,
      (await ctx.config.get<number>("max_tasks")) ?? DEFAULT_MAX_TASKS,
    );

    await ctx.log("updating obsidian daily priorities", {
      date,
      vaultPath,
      dailyFolder,
      maxTasks,
    });

    try {
      const result = await ctx.harness.run("pi", {
        prompt: buildPrompt({ vaultPath, dailyFolder, date, maxTasks }),
        cwd: vaultPath,
        thinking: "off",
        tools: ["read", "write", "edit", "bash", "ffgrep", "fffind"],
      });

      await ctx.log("obsidian daily priorities updated", {
        date,
        outputText: result.outputText,
        toolCallCount: result.toolCalls.length,
      });

      await ctx.emit({
        type: "obsidian.daily-priorities.updated",
        payload: {
          date,
          dailyPath: `${vaultPath}/${dailyFolder}/${date}.md`,
          outputText: result.outputText,
          toolCalls: result.toolCalls,
        },
      });
    } catch (error) {
      await ctx.log("obsidian daily priorities failed", {
        date,
        error: error instanceof Error ? error.message : String(error),
      });

      await ctx.emit({
        type: "obsidian.daily-priorities.failed",
        payload: {
          date,
          dailyPath: `${vaultPath}/${dailyFolder}/${date}.md`,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  });
});
