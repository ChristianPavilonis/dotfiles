import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type {
  AutomationPlugin,
  DispatchDecision,
  DispatchTerminalEvent,
  EvaluationResult,
  PluginContext,
  PluginFactory,
  PluginSchedule,
  WorkItem,
} from "../../types";

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  from?: {
    id: number;
    username?: string;
    is_bot?: boolean;
  };
  chat: {
    id: number;
    type: string;
  };
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

const configSchema = z.object({
  scheduleEverySeconds: z.number().int().min(1).default(30),
  runOnStartup: z.boolean().default(true),
  scheduleJitterSeconds: z.number().int().min(0).default(0),
  botToken: z.string().default(""),
  allowedChatIds: z.array(z.number().int()).default([]),
  workingDirectory: z.string().default("~/dotfiles"),
  maxResponseChars: z.number().int().min(256).max(4096).default(3500),
});

const workItemMetadataSchema = z.object({
  updateId: z.number().int(),
  chatId: z.number().int(),
  messageId: z.number().int(),
  userId: z.number().int().optional(),
  text: z.string().min(1),
});

const dispatchMetadataSchema = z.object({
  updateId: z.number().int(),
  chatId: z.number().int(),
  messageId: z.number().int(),
  userId: z.number().int().optional(),
});

type TelegramPluginConfig = z.infer<typeof configSchema>;
type WorkItemMetadata = z.infer<typeof workItemMetadataSchema>;

const LAST_UPDATE_ID_KEY = "telegram:last_update_id";
const ALLOWED_USERNAME = "christianpav";

const DEFAULT_CONFIG: TelegramPluginConfig = {
  scheduleEverySeconds: 30,
  runOnStartup: true,
  scheduleJitterSeconds: 0,
  botToken: "",
  allowedChatIds: [],
  workingDirectory: "~/dotfiles",
  maxResponseChars: 3500,
};

function readIntEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value || !value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readBoolEnv(name: string): boolean | undefined {
  const value = process.env[name];
  if (!value || !value.trim()) return undefined;

  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return undefined;
}

function parseAllowedChatIds(raw: string | undefined): number[] | undefined {
  if (!raw || !raw.trim()) return undefined;

  const values = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));

  return values.length > 0 ? values : undefined;
}

function resolveConfigFromEnv(): TelegramPluginConfig {
  return configSchema.parse({
    ...DEFAULT_CONFIG,
    scheduleEverySeconds:
      readIntEnv("YESMAND_TELEGRAM_EVERY_SECONDS") ?? DEFAULT_CONFIG.scheduleEverySeconds,
    runOnStartup:
      readBoolEnv("YESMAND_TELEGRAM_RUN_ON_STARTUP") ?? DEFAULT_CONFIG.runOnStartup,
    scheduleJitterSeconds:
      readIntEnv("YESMAND_TELEGRAM_SCHEDULE_JITTER_SECONDS") ??
      DEFAULT_CONFIG.scheduleJitterSeconds,
    botToken: process.env.YESMAND_TELEGRAM_BOT_TOKEN ?? DEFAULT_CONFIG.botToken,
    allowedChatIds:
      parseAllowedChatIds(process.env.YESMAND_TELEGRAM_ALLOWED_CHAT_IDS) ??
      DEFAULT_CONFIG.allowedChatIds,
    workingDirectory:
      process.env.YESMAND_TELEGRAM_WORKING_DIRECTORY ?? DEFAULT_CONFIG.workingDirectory,
    maxResponseChars:
      readIntEnv("YESMAND_TELEGRAM_MAX_RESPONSE_CHARS") ?? DEFAULT_CONFIG.maxResponseChars,
  });
}

function expandHome(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function parseLastUpdateId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCommand(text: string): string | undefined {
  if (!text.startsWith("/")) return undefined;
  const firstToken = text.trim().split(/\s+/)[0] ?? "";
  const [command] = firstToken.split("@");
  return command.toLowerCase();
}

function buildChatStateKey(chatId: number): string {
  return `telegram:chat:${chatId}:last_dedupe_key`;
}

function buildPrompt(messageText: string): string {
  return [
    "You are Yes Man responding in Telegram.",
    "",
    "## User Message",
    messageText,
    "",
    "## Response Rules",
    "1. Reply with plain text suitable for Telegram.",
    "2. Be concise, direct, and helpful.",
  ].join("\n");
}

function splitMessage(input: string, maxChars: number): string[] {
  const text = input.trim();
  if (!text) return ["I finished the request, but I have no text output to send."];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf("\n", maxChars);
    if (splitAt < Math.floor(maxChars * 0.5)) {
      splitAt = remaining.lastIndexOf(" ", maxChars);
    }
    if (splitAt < Math.floor(maxChars * 0.25)) {
      splitAt = maxChars;
    }

    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

class TelegramDemoPlugin implements AutomationPlugin {
  readonly id = "telegram-demo";
  readonly schedule: PluginSchedule;
  private readonly cfg: TelegramPluginConfig;
  private readonly workingDirectory: string;
  private warnedMissingToken = false;

  constructor(config: TelegramPluginConfig) {
    this.cfg = config;
    this.workingDirectory = expandHome(config.workingDirectory);
    this.schedule = {
      everySeconds: config.scheduleEverySeconds,
      runOnStartup: config.runOnStartup,
      jitterSeconds: config.scheduleJitterSeconds,
    };
  }

  private isEnabled(): boolean {
    return this.cfg.botToken.trim().length > 0;
  }

  private isAllowedChat(chatId: number): boolean {
    if (this.cfg.allowedChatIds.length === 0) return true;
    return this.cfg.allowedChatIds.includes(chatId);
  }

  private isAllowedUser(username: string | undefined): boolean {
    return (username ?? "").toLowerCase() === ALLOWED_USERNAME;
  }

  private async telegramApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const resp = await fetch(`https://api.telegram.org/bot${this.cfg.botToken}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "(unable to read response body)");
      throw new Error(`Telegram API ${method} failed: ${resp.status} ${resp.statusText} -- ${body}`);
    }

    const data = (await resp.json()) as TelegramApiResponse<T>;
    if (!data.ok) {
      throw new Error(`Telegram API ${method} error: ${data.description ?? "unknown error"}`);
    }

    return data.result;
  }

  private async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
    return this.telegramApi<TelegramUpdate[]>("getUpdates", {
      offset,
      limit: 50,
      allowed_updates: ["message"],
    });
  }

  private async sendChatAction(chatId: number, ctx: PluginContext): Promise<void> {
    if (ctx.dryRun) {
      ctx.logger.info("Would send Telegram chat action", {
        plugin: this.id,
        chatId,
        action: "typing",
      });
      return;
    }

    await this.telegramApi<true>("sendChatAction", {
      chat_id: chatId,
      action: "typing",
    });
  }

  private async sendMessage(chatId: number, text: string, ctx: PluginContext): Promise<void> {
    const chunks = splitMessage(text, this.cfg.maxResponseChars);

    for (const chunk of chunks) {
      if (ctx.dryRun) {
        ctx.logger.info("Would send Telegram message", {
          plugin: this.id,
          chatId,
          text: chunk,
        });
        continue;
      }

      await this.telegramApi("sendMessage", {
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      });
    }
  }

  private async handleCommand(
    command: string,
    chatId: number,
    ctx: PluginContext
  ): Promise<boolean> {
    if (command === "/start" || command === "/help") {
      await this.sendMessage(
        chatId,
        [
          "Yes Man Telegram demo is online.",
          "",
          "Commands:",
          "- /help: show this message",
          "- /reset: clear chat context for a fresh session",
          "",
          "Send any non-command message to dispatch a Yes Man run.",
        ].join("\n"),
        ctx
      );
      return true;
    }

    if (command === "/reset") {
      ctx.state.delete(buildChatStateKey(chatId));
      await this.sendMessage(chatId, "Context reset. Next message will start a new session.", ctx);
      return true;
    }

    return false;
  }

  async discoverCandidates(ctx: PluginContext): Promise<WorkItem[]> {
    if (!this.isEnabled()) {
      if (!this.warnedMissingToken) {
        ctx.logger.warn("Telegram demo plugin is idle because bot token is missing", {
          plugin: this.id,
          envVar: "YESMAND_TELEGRAM_BOT_TOKEN",
        });
        this.warnedMissingToken = true;
      }
      return [];
    }

    const lastUpdateId = parseLastUpdateId(ctx.state.get(LAST_UPDATE_ID_KEY));
    const updates = await this.getUpdates(
      lastUpdateId !== undefined ? lastUpdateId + 1 : undefined
    );

    if (updates.length === 0) {
      return [];
    }

    let maxUpdateId = lastUpdateId ?? -1;
    const items: WorkItem[] = [];

    for (const update of updates) {
      if (update.update_id > maxUpdateId) {
        maxUpdateId = update.update_id;
      }

      const message = update.message;
      if (!message?.text) continue;
      if (message.from?.is_bot) continue;
      if (!this.isAllowedUser(message.from?.username)) {
        continue;
      }

      const text = message.text.trim();
      if (!text) continue;

      const chatId = message.chat.id;
      if (!this.isAllowedChat(chatId)) {
        await this.sendMessage(
          chatId,
          "This Yes Man demo bot is not configured for this chat.",
          ctx
        );
        continue;
      }

      const command = parseCommand(text);
      if (command) {
        const handled = await this.handleCommand(command, chatId, ctx);
        if (handled) {
          continue;
        }
      }

      const metadata: WorkItemMetadata = {
        updateId: update.update_id,
        chatId,
        messageId: message.message_id,
        userId: message.from?.id,
        text,
      };

      items.push({
        id: `telegram:${chatId}:${message.message_id}`,
        title: `Telegram message ${chatId}/${message.message_id}`,
        body: text,
        url: `telegram://chat/${chatId}/message/${message.message_id}`,
        createdAt: new Date(message.date * 1000).toISOString(),
        metadata,
      });
    }

    if (maxUpdateId >= 0) {
      ctx.state.set(LAST_UPDATE_ID_KEY, String(maxUpdateId));
    }

    return items;
  }

  async evaluateCandidate(item: WorkItem, ctx: PluginContext): Promise<EvaluationResult> {
    const metadata = workItemMetadataSchema.parse(item.metadata);

    if (!(await pathExists(this.workingDirectory))) {
      return {
        kind: "wait",
        reason: `Working directory not found: ${this.workingDirectory}`,
      };
    }

    const dedupeKey = `${item.id}:v1`;
    const previousDedupeKey = ctx.state.get(buildChatStateKey(metadata.chatId));

    return {
      kind: "dispatch",
      phase: "implementation",
      dedupeKey,
      sessionTitle: `Telegram chat ${metadata.chatId}`,
      directory: this.workingDirectory,
      prompt: buildPrompt(metadata.text),
      continueFromDedupeKey: previousDedupeKey,
      metadata: {
        updateId: metadata.updateId,
        chatId: metadata.chatId,
        messageId: metadata.messageId,
        userId: metadata.userId,
      },
    };
  }

  async onDispatchSuccess(
    item: WorkItem,
    decision: DispatchDecision,
    sessionId: string,
    ctx: PluginContext
  ): Promise<void> {
    const metadata = dispatchMetadataSchema.safeParse(decision.metadata ?? {});
    if (!metadata.success) {
      ctx.logger.warn("Telegram dispatch missing metadata", {
        plugin: this.id,
        itemId: item.id,
        sessionId,
      });
      return;
    }

    const chatStateKey = buildChatStateKey(metadata.data.chatId);
    ctx.state.set(chatStateKey, decision.dedupeKey);

    try {
      await this.sendChatAction(metadata.data.chatId, ctx);
    } catch (error) {
      ctx.logger.warn("Failed to send Telegram typing indicator", {
        plugin: this.id,
        itemId: item.id,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async onDispatchFailure(
    item: WorkItem,
    decision: DispatchDecision,
    error: string,
    ctx: PluginContext
  ): Promise<void> {
    const metadata = dispatchMetadataSchema.safeParse(decision.metadata ?? {});
    if (!metadata.success) {
      ctx.logger.warn("Telegram dispatch failure missing metadata", {
        plugin: this.id,
        itemId: item.id,
        error,
      });
      return;
    }

    await this.sendMessage(
      metadata.data.chatId,
      "I could not start that request. Please try again in a moment.",
      ctx
    );
  }

  async onDispatchTerminal(event: DispatchTerminalEvent, ctx: PluginContext): Promise<void> {
    const metadata = dispatchMetadataSchema.safeParse(event.metadata ?? {});
    if (!metadata.success) {
      ctx.logger.warn("Telegram terminal callback missing metadata", {
        plugin: this.id,
        dedupeKey: event.dedupeKey,
        status: event.status,
      });
      return;
    }

    const chatId = metadata.data.chatId;

    if (event.status === "completed") {
      const responseText = event.responseText?.trim();
      if (responseText) {
        await this.sendMessage(chatId, responseText, ctx);
        return;
      }

      await this.sendMessage(
        chatId,
        "Done, but I did not get any response text. Try asking again with more detail.",
        ctx
      );
      return;
    }

    await this.sendMessage(
      chatId,
      `I could not finish that request (${event.status}). Please retry or send /reset to start fresh.`,
      ctx
    );
  }
}

export const createPlugin: PluginFactory = async () => {
  return new TelegramDemoPlugin(resolveConfigFromEnv());
};
