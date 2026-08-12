type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export type Settings = {
  enabled: boolean;
  workspaceId?: string;
  projectsRoot: string;
  branches: string[];
  timeZone: string;
  dailyHour: number;
  dailyMinute: number;
  pollIntervalSeconds: number;
};

type State = {
  settings: Settings;
  enabledWorkspaces: Set<string>;
  initialized: boolean;
  shuttingDown: boolean;
  polling: boolean;
  completedDate?: string;
  pendingRequests: Map<string, number>;
  timer?: ReturnType<typeof setInterval>;
};

const EXTENSION_ID = "git-main-updater";
const EXTENSION_RELEASE = "0.1.0";
const DEFAULT_PROJECTS_ROOT = "/Users/christian/projects";
const DEFAULT_BRANCHES = ["main", "master"];
const DEFAULT_TIME_ZONE = "America/Chicago";
const DEFAULT_DAILY_HOUR = 6;
const DEFAULT_DAILY_MINUTE = 30;
const DEFAULT_POLL_INTERVAL_SECONDS = 900;
const REQUEST_TIMEOUT_MS = 30_000;
let outputQueue: Promise<void> = Promise.resolve();

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
    projectsRoot: state.settings.projectsRoot,
    branches: state.settings.branches,
    timeZone: state.settings.timeZone,
    schedule: `${String(state.settings.dailyHour).padStart(2, "0")}:${
      String(state.settings.dailyMinute).padStart(2, "0")
    }`,
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
    log("host rejected main branch update conversation request", {
      requestId: frame.id,
      code: frame.error.code,
      message: frame.error.message,
    });
    return;
  }
  state.completedDate = dateFromRequestId(frame.id);
  log("host accepted main branch update conversation request", {
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
    if (!isDue(now, settings) || state.completedDate === now.date) return;

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
    log("main branch update poll failed", { error: errorMessage(error) });
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
  const branches = settings.branches.map((branch) => `- \`${branch}\``).join(
    "\n",
  );
  return `Update the local main branches for Christian's direct-child Git repositories.

Projects root: ${settings.projectsRoot}
Scheduled date: ${date}
Branches to update:
${branches}

Work only on non-hidden direct child directories of the projects root that are Git worktrees. Do not recurse into subdirectories, initialize repositories, clone repositories, change remotes, switch branches, merge, rebase, reset, stash, commit, push, or modify project files.

For each eligible repository:
1. Confirm it is a Git worktree and has an \`origin\` remote. Record and skip repositories that do not.
2. Run \`git fetch --prune origin\`. If that fails, record the failure and do not update its branches.
3. For each configured branch, skip it when neither \`refs/heads/<branch>\` nor \`refs/remotes/origin/<branch>\` exists after the prune.
4. If that branch is checked out, run \`git status --porcelain\`. Skip it when anything is reported; otherwise update only with \`git pull --ff-only origin <branch>\`.
5. If the branch is not checked out, update the local branch without switching branches only when \`origin/<branch>\` exists, using \`git fetch origin <branch>:<branch>\`. Do not force the refspec; record a non-fast-forward rejection as a failure.

Use exact branch names from the configuration and quote all paths. Finish with a concise per-repository summary of updated, skipped, and failed branches. Do not ask follow-up questions.`;
}

export function parseSettings(value: Json | undefined): Settings {
  const config = isObject(value) ? value : {};
  const workspaceId = uuidV7(config.workspace_id) ?? undefined;
  return {
    enabled: config.enabled === true && workspaceId !== undefined,
    workspaceId,
    projectsRoot: absolutePath(config.projects_root, DEFAULT_PROJECTS_ROOT),
    branches: branchNames(config.branches),
    timeZone: validTimeZone(config.time_zone) ?? DEFAULT_TIME_ZONE,
    dailyHour: boundedInteger(config.daily_hour, DEFAULT_DAILY_HOUR, 0, 23),
    dailyMinute: boundedInteger(
      config.daily_minute,
      DEFAULT_DAILY_MINUTE,
      0,
      59,
    ),
    pollIntervalSeconds: boundedInteger(
      config.poll_interval_seconds,
      DEFAULT_POLL_INTERVAL_SECONDS,
      60,
      86_400,
    ),
  };
}

function defaultSettings(): Settings {
  return parseSettings({});
}

export function dailyRequestId(workspaceId: string, date: string): string {
  return `git-main-updater:${workspaceId}:${date}`;
}

function dateFromRequestId(requestId: string): string | undefined {
  const match = /^git-main-updater:[0-9a-f-]+:(\d{4}-\d{2}-\d{2})$/.exec(
    requestId,
  );
  return match?.[1];
}

export function conversationTitle(date: string): string {
  return `Update project main branches ${date}`;
}

export function nowInTimeZone(
  date: Date,
  timeZone: string,
): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    hour: Number(byType.hour),
    minute: Number(byType.minute),
  };
}

export function isDue(
  now: { hour: number; minute: number },
  settings: Pick<Settings, "dailyHour" | "dailyMinute">,
): boolean {
  return now.hour > settings.dailyHour ||
    (now.hour === settings.dailyHour && now.minute >= settings.dailyMinute);
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
  const write = outputQueue.then(async () => {
    const writer = Deno.stdout.writable.getWriter();
    try {
      await writer.write(
        new TextEncoder().encode(`${JSON.stringify(frame)}\n`),
      );
    } finally {
      writer.releaseLock();
    }
  });
  outputQueue = write.catch(() => {});
  await write;
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

function branchNames(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return DEFAULT_BRANCHES;
  const branches = value.filter((branch): branch is string =>
    typeof branch === "string" && isSafeBranchName(branch)
  );
  return branches.length > 0 ? [...new Set(branches)] : DEFAULT_BRANCHES;
}

function isSafeBranchName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) &&
    !value.includes("..") && !value.includes("//") &&
    !value.endsWith(".") && !value.endsWith("/") && !value.endsWith(".lock");
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
