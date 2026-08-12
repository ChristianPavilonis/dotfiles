type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

type Settings = {
  enabled: boolean;
  workspaceId?: string;
  vaultPath: string;
  dailyFolder: string;
  timeZone: string;
  dailyHour: number;
  pollIntervalSeconds: number;
  maxTasks: number;
};

type State = {
  settings: Settings;
  enabledWorkspaces: Set<string>;
  initialized: boolean;
  shuttingDown: boolean;
  polling: boolean;
  completedDate?: string;
  pendingRequests: Map<string, number>;
  timer?: number;
};

const EXTENSION_ID = "obsidian-daily-priorities";
const EXTENSION_RELEASE = "0.1.0";
const DEFAULT_VAULT_PATH = "/Users/christian/Documents/MyObsidianVault";
const DEFAULT_DAILY_FOLDER = "daily";
const DEFAULT_TIME_ZONE = "America/Chicago";
const DEFAULT_DAILY_HOUR = 7;
const DEFAULT_POLL_INTERVAL_SECONDS = 900;
const DEFAULT_MAX_TASKS = 12;
const REQUEST_TIMEOUT_MS = 30_000;

const state: State = {
  settings: defaultSettings(),
  enabledWorkspaces: new Set(),
  initialized: false,
  shuttingDown: false,
  polling: false,
  pendingRequests: new Map(),
};

if (import.meta.main) await run();

async function run(): Promise<void> {
  try {
    for await (const line of stdinLines()) {
      if (line.trim().length === 0) continue;
      await handleFrame(line);
      if (state.shuttingDown) break;
    }
  } catch (error) {
    log("stdin closed or unreadable", { error: errorMessage(error) });
  } finally {
    stopPolling();
  }
}

async function handleFrame(line: string): Promise<void> {
  let frame: JsonObject;
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isObject(parsed)) throw new Error("frame is not an object");
    frame = parsed;
  } catch (error) {
    throw new Error(`invalid host frame: ${errorMessage(error)}`);
  }
  if (frame.jsonrpc !== "2.0") {
    throw new Error("host frame has an invalid JSON-RPC version");
  }

  if (typeof frame.method !== "string") {
    handleResponse(frame);
    return;
  }

  switch (frame.method) {
    case "yesman.initialize":
      await initialize(frame);
      return;
    case "yesman.initialized":
      if (!isObject(frame.params)) {
        throw new Error("initialized notification is invalid");
      }
      state.initialized = true;
      startPolling();
      return;
    case "yesman.shutdown":
      await shutdown(frame);
      return;
    default:
      if (typeof frame.id === "string") {
        await respondError(frame.id, -32601, "method not found");
      }
  }
}

async function initialize(frame: JsonObject): Promise<void> {
  if (typeof frame.id !== "string" || !isObject(frame.params)) {
    throw new Error("invalid initialization request");
  }
  const params = frame.params;
  if (
    params.protocol !== "yesman.extension/1" ||
    params.extension_id !== EXTENSION_ID ||
    params.extension_release !== EXTENSION_RELEASE
  ) {
    await respondError(frame.id, -32602, "initialization identity is invalid");
    return;
  }

  state.settings = parseSettings(params.config);
  state.enabledWorkspaces = new Set(
    Array.isArray(params.enabled_workspace_ids)
      ? params.enabled_workspace_ids.filter((value): value is string =>
        typeof value === "string"
      )
      : [],
  );
  await respond(frame.id, {
    protocol: "yesman.extension/1",
    extension_id: EXTENSION_ID,
    extension_release: EXTENSION_RELEASE,
    tools: [],
    event_subscriptions: [],
  });
  log("initialized", {
    enabled: state.settings.enabled,
    workspaceId: state.settings.workspaceId ?? "not configured",
    timeZone: state.settings.timeZone,
    dailyHour: state.settings.dailyHour,
  });
}

async function shutdown(frame: JsonObject): Promise<void> {
  state.shuttingDown = true;
  state.initialized = false;
  stopPolling();
  if (typeof frame.id === "string") await respond(frame.id, { accepted: true });
}

function handleResponse(frame: JsonObject): void {
  if (typeof frame.id !== "string" || !state.pendingRequests.delete(frame.id)) {
    return;
  }
  if (isObject(frame.error)) {
    log("host rejected daily priorities conversation request", {
      requestId: frame.id,
      code: frame.error.code,
      message: frame.error.message,
    });
    return;
  }
  state.completedDate = dateFromRequestId(frame.id);
  log("host accepted daily priorities conversation request", {
    requestId: frame.id,
  });
}

function startPolling(): void {
  stopPolling();
  void poll();
  state.timer = setInterval(
    () => void poll(),
    state.settings.pollIntervalSeconds * 1000,
  );
}

function stopPolling(): void {
  if (state.timer !== undefined) clearInterval(state.timer);
  state.timer = undefined;
}

async function poll(): Promise<void> {
  if (
    !state.initialized || state.shuttingDown || state.polling ||
    !state.settings.enabled
  ) return;
  state.polling = true;
  try {
    expireUnansweredRequests();
    const settings = state.settings;
    if (
      !settings.workspaceId ||
      !state.enabledWorkspaces.has(settings.workspaceId)
    ) return;

    const now = nowInTimeZone(new Date(), settings.timeZone);
    if (now.hour < settings.dailyHour || state.completedDate === now.date) {
      return;
    }

    const requestId = dailyRequestId(settings.workspaceId, now.date);
    if (state.pendingRequests.has(requestId)) return;

    state.pendingRequests.set(requestId, Date.now());
    await writeFrame({
      jsonrpc: "2.0",
      id: requestId,
      method: "conversations.create",
      params: {
        workspace_id: settings.workspaceId,
        title: conversationTitle(now.date),
        text: buildPrompt(settings, now.date),
      },
    });
  } catch (error) {
    log("daily priorities poll failed", { error: errorMessage(error) });
  } finally {
    state.polling = false;
  }
}

function expireUnansweredRequests(): void {
  const deadline = Date.now() - REQUEST_TIMEOUT_MS;
  for (const [requestId, sentAt] of state.pendingRequests) {
    if (sentAt <= deadline) {
      state.pendingRequests.delete(requestId);
      log("retrying an unanswered durable conversation request", { requestId });
    }
  }
}

export function buildPrompt(settings: Settings, date: string): string {
  const dailyPath = `${settings.vaultPath}/${settings.dailyFolder}/${date}.md`;
  return `You are updating Christian's Obsidian vault.

Vault path: ${settings.vaultPath}
Daily note path: ${dailyPath}
Date: ${date}

Goal: create or update today's daily note with a generated priorities section based on open or active task notes.

Instructions:
1. Inspect the vault for project task notes with frontmatter \`type: task\` and \`status: open\` or \`status: active\`.
2. Also consider obvious unchecked Markdown tasks (\`- [ ]\`) in project task notes when they represent current work.
3. Summarize the most relevant ${settings.maxTasks} priorities, grouped by project when useful.
4. Update only this managed block in the daily note:

<!-- yesman-priorities:start -->
## Priorities

<!-- generated content goes here -->
<!-- yesman-priorities:end -->

5. If the managed block already exists, replace only its contents, preserving all unrelated user-written content.
6. If the daily note exists without the managed block, insert the block near its top while preserving existing content.
7. If the daily note does not exist, create it using the vault's current daily-note conventions. Do not invent frontmatter or navigation conventions; inspect nearby daily notes first. Include the managed block and preserve room for user notes.
8. Use wikilinks to task notes when possible.
9. Do not delete, rewrite, or reorganize unrelated note content.
10. Do not ask follow-up questions. Perform the update, then report the file path and a concise summary of changes.`;
}

export function parseSettings(value: Json | undefined): Settings {
  const config = isObject(value) ? value : {};
  const vaultPath = absolutePath(config.vault_path, DEFAULT_VAULT_PATH);
  const dailyFolder = relativePath(config.daily_folder, DEFAULT_DAILY_FOLDER);
  const timeZone = validTimeZone(config.time_zone) ?? DEFAULT_TIME_ZONE;
  const workspaceId = uuidV7(config.workspace_id) ?? undefined;
  return {
    enabled: config.enabled === true && workspaceId !== undefined,
    workspaceId,
    vaultPath,
    dailyFolder,
    timeZone,
    dailyHour: boundedInteger(config.daily_hour, DEFAULT_DAILY_HOUR, 0, 23),
    pollIntervalSeconds: boundedInteger(
      config.poll_interval_seconds,
      DEFAULT_POLL_INTERVAL_SECONDS,
      60,
      86_400,
    ),
    maxTasks: boundedInteger(config.max_tasks, DEFAULT_MAX_TASKS, 1, 50),
  };
}

function defaultSettings(): Settings {
  return parseSettings({});
}

export function dailyRequestId(workspaceId: string, date: string): string {
  return `obsidian-daily-priorities:${workspaceId}:${date}`;
}

function dateFromRequestId(requestId: string): string | undefined {
  const match = /^obsidian-daily-priorities:[0-9a-f-]+:(\d{4}-\d{2}-\d{2})$/
    .exec(requestId);
  return match?.[1];
}

export function conversationTitle(date: string): string {
  return `Update Obsidian priorities ${date}`;
}

export function nowInTimeZone(
  date: Date,
  timeZone: string,
): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    hour: Number(byType.hour),
  };
}

async function respond(id: string, result: JsonObject): Promise<void> {
  await writeFrame({ jsonrpc: "2.0", id, result });
}

async function respondError(
  id: string,
  code: number,
  message: string,
): Promise<void> {
  await writeFrame({ jsonrpc: "2.0", id, error: { code, message } });
}

async function writeFrame(frame: JsonObject): Promise<void> {
  const writer = Deno.stdout.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${JSON.stringify(frame)}\n`));
  } finally {
    writer.releaseLock();
  }
}

async function* stdinLines(): AsyncGenerator<string> {
  const reader = Deno.stdin.readable.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      yield* lines;
    }
    pending += decoder.decode();
    if (pending.length > 0) yield pending;
  } finally {
    reader.releaseLock();
  }
}

function boundedInteger(
  value: Json | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isInteger(value) &&
      value >= minimum && value <= maximum
    ? value
    : fallback;
}

function absolutePath(value: Json | undefined, fallback: string): string {
  return typeof value === "string" && value.startsWith("/") ? value : fallback;
}

function relativePath(value: Json | undefined, fallback: string): string {
  if (
    typeof value !== "string" || value.length === 0 || value.startsWith("/")
  ) return fallback;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..")
    ? value
    : fallback;
}

function validTimeZone(value: Json | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

function uuidV7(value: Json | undefined): string | undefined {
  return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        .test(value)
    ? value
    : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function log(message: string, details?: JsonObject): void {
  console.error(
    `[${EXTENSION_ID}] ${message}${
      details ? ` ${JSON.stringify(details)}` : ""
    }`,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
