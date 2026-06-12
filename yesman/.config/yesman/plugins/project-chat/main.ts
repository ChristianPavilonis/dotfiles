import {
  definePlugin,
  type HarnessRunInfo,
  type HarnessRunState,
  html,
  type PluginContext,
  raw,
  type UiRequest,
} from "@yesman/sdk";

type ProjectConfig = {
  slug: string;
  projectSlug: string;
  name: string;
  cwd: string;
  description: string;
  systemPrompt: string;
};

type ChatThread = {
  id: string;
  project: string;
  title: string;
  cwd: string;
  harnessSessionId?: string;
  activeRunId?: string;
  activeAssistantMessageId?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?:
    | "pending"
    | "streaming"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted";
  runId?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

type ChatRun = {
  runId: string;
  threadId: string;
  project: string;
  userMessageId: string;
  assistantMessageId: string;
  harnessSessionId?: string;
  state: HarnessRunState;
  startedAt: string;
  completedAt?: string;
  lastSequence?: number;
};

const PROJECTS: ProjectConfig[] = [
  {
    slug: "rigzilla",
    projectSlug: "rigzilla",
    name: "Rigzilla",
    cwd: "/home/christian/projects/rigzilla",
    description: "Marketplace/product work for Rigzilla.",
    systemPrompt:
      "You are helping with the Rigzilla project. Use the project cwd, preserve implementation context, and be explicit about files, commands, and follow-up risks.",
  },
  {
    slug: "trusted-server",
    projectSlug: "trusted-server",
    name: "Trusted Server",
    cwd: "/home/christian/projects/trusted-server",
    description: "Trusted Server backend and infrastructure work.",
    systemPrompt:
      "You are helping with Trusted Server. Prefer durable, security-conscious changes and summarize operational impact.",
  },
  {
    slug: "scrapezilla",
    projectSlug: "scrapezilla",
    name: "Scrapezilla",
    cwd: "/home/christian/projects/scrapezilla",
    description: "Scraping/data pipeline project work.",
    systemPrompt:
      "You are helping with Scrapezilla. Be careful about scraping reliability, data shape changes, and reproducible validation.",
  },
  {
    slug: "tauri-tutorials",
    projectSlug: "tauritutorials",
    name: "Tauri Tutorials",
    cwd: "/home/christian/Documents/MyObsidianVault",
    description: "Tauri tutorial planning, notes, and content.",
    systemPrompt:
      "You are helping with Tauri Tutorials. Keep explanations tutorial-friendly and preserve useful notes for later.",
  },
  {
    slug: "ideas",
    projectSlug: "ideas",
    name: "Ideas",
    cwd: "/home/christian/Documents/MyObsidianVault",
    description: "General ideas and incubation threads.",
    systemPrompt:
      "You are helping develop ideas. Be exploratory but capture decisions, open questions, and next actions clearly.",
  },
  {
    slug: "yesman",
    projectSlug: "yesman",
    name: "YesMan",
    cwd: "/home/christian/projects/yesman",
    description: "Yesman core, plugins, harnesses, and UI.",
    systemPrompt:
      "You are helping with Yesman. Preserve backwards compatibility, keep core primitives generic, and validate Rust plus Deno changes.",
  },
];

const PROJECT_BY_SLUG = new Map(
  PROJECTS.map((project) => [project.slug, project]),
);
const ACTIVE_RUNS_KEY = "runs:active";
const DEFAULT_THREAD_TITLE = "New chat";
const RECENT_MESSAGE_BUDGET = 16_000;

function statusBadgeClass(status?: ChatMessage["status"]): string {
  switch (status) {
    case "completed":
      return "ym-badge ym-badge-success";
    case "failed":
    case "cancelled":
    case "interrupted":
      return "ym-badge ym-badge-destructive";
    case "pending":
    case "streaming":
    default:
      return "ym-badge";
  }
}

function renderStatusBadge(status?: ChatMessage["status"]): string {
  if (!status) return "";
  return html`
    <span class="${statusBadgeClass(status)}">${status}</span>
  `;
}

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function threadKey(threadId: string): string {
  return `thread:${threadId}`;
}

function messagesKey(threadId: string): string {
  return `thread:${threadId}:messages`;
}

function runKey(runId: string): string {
  return `run:${runId}`;
}

function projectThreadsKey(project: string): string {
  return `threads:project:${project}`;
}

function projectHref(project: ProjectConfig, threadId?: string): string {
  const suffix = threadId ? `?thread=${encodeURIComponent(threadId)}` : "";
  return `/plugins/project-chat/${project.slug}${suffix}`;
}

async function getThread(
  ctx: PluginContext,
  threadId: string,
): Promise<ChatThread | null> {
  return await ctx.kv.get<ChatThread>(threadKey(threadId));
}

async function getMessages(
  ctx: PluginContext,
  threadId: string,
): Promise<ChatMessage[]> {
  return await ctx.kv.get<ChatMessage[]>(messagesKey(threadId)) ?? [];
}

async function appendUnique<T>(
  ctx: PluginContext,
  key: string,
  value: T,
): Promise<void> {
  await ctx.kv.update<T[]>(key, (items) => {
    const next = items ? [...items] : [];
    if (!next.includes(value)) next.push(value);
    return next;
  });
}

async function removeValue<T>(
  ctx: PluginContext,
  key: string,
  value: T,
): Promise<void> {
  await ctx.kv.update<T[]>(
    key,
    (items) => (items ?? []).filter((item) => item !== value),
  );
}

async function createThread(
  ctx: PluginContext,
  project: ProjectConfig,
): Promise<ChatThread> {
  const createdAt = nowIso();
  const session = await ctx.harness.sessions.create("pi", {
    cwd: project.cwd,
    mode: "auto",
    metadata: { project: project.slug },
  });
  const thread: ChatThread = {
    id: id("thread"),
    project: project.slug,
    title: DEFAULT_THREAD_TITLE,
    cwd: project.cwd,
    harnessSessionId: session.id,
    createdAt,
    updatedAt: createdAt,
  };
  await ctx.kv.set(threadKey(thread.id), thread);
  await ctx.kv.set(messagesKey(thread.id), []);
  await appendUnique(ctx, "threads:index", thread.id);
  await appendUnique(ctx, projectThreadsKey(project.slug), thread.id);
  return thread;
}

async function ensureThreadSession(
  ctx: PluginContext,
  project: ProjectConfig,
  thread: ChatThread,
): Promise<string> {
  if (thread.harnessSessionId) return thread.harnessSessionId;
  const session = await ctx.harness.sessions.create("pi", {
    cwd: project.cwd,
    mode: "auto",
    metadata: { project: project.slug, threadId: thread.id },
  });
  await ctx.kv.update<ChatThread>(threadKey(thread.id), (current) => ({
    ...(current ?? thread),
    harnessSessionId: session.id,
    updatedAt: nowIso(),
  }));
  return session.id;
}

async function listProjectThreads(
  ctx: PluginContext,
  project: ProjectConfig,
): Promise<ChatThread[]> {
  const ids = await ctx.kv.get<string[]>(projectThreadsKey(project.slug)) ?? [];
  const threads = (await Promise.all(ids.map((threadId) => getThread(ctx, threadId))))
    .filter((thread): thread is ChatThread => Boolean(thread && !thread.archivedAt));
  threads.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return threads;
}

async function buildPrompt(
  project: ProjectConfig,
  thread: ChatThread,
  messages: ChatMessage[],
  userContent: string,
): Promise<string> {
  const transcript: string[] = [];
  let budget = RECENT_MESSAGE_BUDGET;
  for (const message of [...messages].reverse()) {
    if (message.role === "system") continue;
    const line = `${message.role.toUpperCase()}: ${message.content.trim()}`;
    if (!line.trim()) continue;
    if (budget - line.length < 0) break;
    transcript.unshift(line);
    budget -= line.length;
  }

  return [
    project.systemPrompt,
    "",
    `Project: ${project.name}`,
    `Project slug: ${project.projectSlug}`,
    `Working directory: ${project.cwd}`,
    "",
    thread.summary ? `Thread summary:\n${thread.summary}` : "Thread summary: (none yet)",
    "",
    "Recent transcript:",
    transcript.length ? transcript.join("\n\n") : "(no prior messages)",
    "",
    "Current user message:",
    userContent,
    "",
    "Instructions: answer as a project-aware coding assistant. If you inspect or modify files, mention the paths and validation commands. Preserve context that will be useful in later turns.",
  ].join("\n");
}

async function startChatRun(
  ctx: PluginContext,
  project: ProjectConfig,
  thread: ChatThread,
  content: string,
): Promise<ChatRun> {
  const timestamp = nowIso();
  const userMessage: ChatMessage = {
    id: id("msg-user"),
    role: "user",
    content,
    status: "completed",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const assistantMessage: ChatMessage = {
    id: id("msg-assistant"),
    role: "assistant",
    content: "",
    status: "streaming",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const pendingRunId = `pending:${assistantMessage.id}`;

  const lockedThread = await ctx.kv.update<ChatThread>(
    threadKey(thread.id),
    (current) => {
      const next = current ?? thread;
      if (next.activeRunId) {
        throw new Error(
          "This thread already has an active run. Cancel or wait for it to finish.",
        );
      }
      return {
        ...next,
        activeRunId: pendingRunId,
        activeAssistantMessageId: assistantMessage.id,
        updatedAt: timestamp,
      };
    },
  );

  let startedRunId: string | undefined;

  try {
    await ctx.kv.update<ChatMessage[]>(messagesKey(thread.id), (messages) => [
      ...(messages ?? []),
      userMessage,
      assistantMessage,
    ]);

    const sessionId = await ensureThreadSession(ctx, project, lockedThread);
    const session = await ctx.harness.sessions.get(sessionId).catch(() => undefined);
    const messages = await getMessages(ctx, thread.id);
    const promptMessages = session?.mode === "native"
      ? []
      : messages.filter((message) =>
        message.id !== userMessage.id && message.id !== assistantMessage.id
      );
    const prompt = await buildPrompt(
      project,
      { ...lockedThread, harnessSessionId: sessionId },
      promptMessages,
      content,
    );

    const run = await ctx.harness.sessions.start(sessionId, {
      prompt,
      cwd: project.cwd,
      metadata: {
        threadId: thread.id,
        project: project.slug,
        projectCwd: project.cwd,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
      },
    });
    startedRunId = run.runId;

    const chatRun: ChatRun = {
      runId: run.runId,
      threadId: thread.id,
      project: project.slug,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      harnessSessionId: sessionId,
      state: "running",
      startedAt: timestamp,
    };
    assistantMessage.runId = run.runId;
    await ctx.kv.set(runKey(run.runId), chatRun);
    await appendUnique(ctx, ACTIVE_RUNS_KEY, run.runId);
    await ctx.kv.update<ChatMessage[]>(
      messagesKey(thread.id),
      (current) =>
        (current ?? []).map((message) =>
          message.id === assistantMessage.id ? { ...message, runId: run.runId } : message
        ),
    );
    await ctx.kv.update<ChatThread>(threadKey(thread.id), (current) => ({
      ...(current ?? lockedThread),
      harnessSessionId: sessionId,
      activeRunId: run.runId,
      activeAssistantMessageId: assistantMessage.id,
      title: (current?.title ?? lockedThread.title) === DEFAULT_THREAD_TITLE
        ? titleFromContent(content)
        : (current?.title ?? lockedThread.title),
      updatedAt: nowIso(),
    }));
    return chatRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (startedRunId) {
      await ctx.harness.cancel(startedRunId).catch(() => undefined);
      await removeValue(ctx, ACTIVE_RUNS_KEY, startedRunId).catch(() => undefined);
    }
    await markAssistantTerminal(
      ctx,
      thread.id,
      assistantMessage.id,
      "failed",
      "",
      message,
    );
    await ctx.kv.update<ChatThread>(threadKey(thread.id), (current) => {
      const next = current ?? lockedThread;
      if (
        next.activeRunId !== pendingRunId && next.activeRunId !== startedRunId
      ) {
        return { ...next, updatedAt: nowIso() };
      }
      return {
        ...next,
        activeRunId: undefined,
        activeAssistantMessageId: undefined,
        updatedAt: nowIso(),
      };
    });
    throw error;
  }
}

function titleFromContent(content: string): string {
  const firstLine = content.trim().split(/\r?\n/)[0] ?? DEFAULT_THREAD_TITLE;
  return firstLine.slice(0, 64) || DEFAULT_THREAD_TITLE;
}

async function markAssistantTerminal(
  ctx: PluginContext,
  threadId: string,
  assistantMessageId: string,
  status: NonNullable<ChatMessage["status"]>,
  content: string,
  error?: string,
): Promise<void> {
  await ctx.kv.update<ChatMessage[]>(
    messagesKey(threadId),
    (messages) =>
      (messages ?? []).map((message) => {
        if (message.id !== assistantMessageId) return message;
        return {
          ...message,
          content: content || message.content,
          status,
          error,
          updatedAt: nowIso(),
        };
      }),
  );
}

async function finalizeRun(
  ctx: PluginContext,
  runId: string,
): Promise<{ state: HarnessRunState }> {
  const chatRun = await ctx.kv.get<ChatRun>(runKey(runId));
  if (!chatRun) throw new Error(`Unknown chat run: ${runId}`);
  const info = await ctx.harness.get(runId);
  if (info.state === "running") return { state: "running" };

  const output = info.result?.outputText ?? await outputFromEvents(ctx, runId);
  const error = info.error ?? terminalError(info);
  const status = info.state === "completed" ? "completed" : info.state;
  await markAssistantTerminal(
    ctx,
    chatRun.threadId,
    chatRun.assistantMessageId,
    status,
    output,
    error,
  );

  await ctx.kv.update<ChatRun>(runKey(runId), (current) => ({
    ...(current ?? chatRun),
    state: info.state,
    completedAt: info.completedAt ?? nowIso(),
  }));
  await removeValue(ctx, ACTIVE_RUNS_KEY, runId);
  await ctx.kv.update<ChatThread>(threadKey(chatRun.threadId), (thread) => {
    if (!thread) throw new Error(`Missing thread for run ${runId}`);
    return {
      ...thread,
      activeRunId: thread.activeRunId === runId ? undefined : thread.activeRunId,
      activeAssistantMessageId: thread.activeRunId === runId
        ? undefined
        : thread.activeAssistantMessageId,
      updatedAt: nowIso(),
    };
  });

  return { state: info.state };
}

async function outputFromEvents(
  ctx: PluginContext,
  runId: string,
): Promise<string> {
  const events = await ctx.harness.events(runId, {
    afterSequence: 0,
    limit: 10_000,
  });
  let output = "";
  for (const stored of events) {
    if (stored.event.type === "text_delta") output += stored.event.delta;
    if (stored.event.type === "completed" && stored.event.result.outputText) {
      output = stored.event.result.outputText;
    }
  }
  return output.trim();
}

function terminalError(info: HarnessRunInfo): string | undefined {
  switch (info.state) {
    case "failed":
      return "Harness run failed";
    case "cancelled":
      return "Harness run cancelled";
    case "interrupted":
      return "Harness run interrupted by daemon restart";
    default:
      return undefined;
  }
}

async function finalizeActiveRuns(ctx: PluginContext): Promise<void> {
  const active = await ctx.kv.get<string[]>(ACTIVE_RUNS_KEY) ?? [];
  for (const runId of active) {
    try {
      const info = await ctx.harness.get(runId);
      if (info.state !== "running") await finalizeRun(ctx, runId);
    } catch (error) {
      await ctx.log("project-chat active run monitor failed", {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function renderIndex(ctx: PluginContext): Promise<string> {
  const cards = await Promise.all(PROJECTS.map(async (project) => {
    const threads = await listProjectThreads(ctx, project);
    const latest = threads[0];
    return html`
      <a
        class="ym-panel block p-4 transition hover:border-primary"
        href="${projectHref(project)}"
        hx-get="${projectHref(project)}"
        hx-target="#main"
        hx-push-url="true"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="ym-eyebrow">Project</div>
            <h2 class="mt-2 text-lg font-semibold tracking-wide">${project
              .name}</h2>
            <p class="mt-1 text-sm text-muted-foreground">${project
              .description}</p>
          </div>
          <span class="ym-badge">${threads.length} thread${threads.length === 1 ? "" : "s"}</span>
        </div>
        <p class="mt-4 font-mono text-xs text-muted-foreground">${project
          .cwd}</p>
        ${latest
          ? raw(html`
            <p class="mt-3 truncate text-sm">Latest: ${latest.title}</p>
          `)
          : raw(html`
            <p class="mt-3 text-sm text-muted-foreground">No threads yet.</p>
          `)}
      </a>
    `;
  }));

  return html`
    <section class="space-y-6">
      <header class="ym-page-header space-y-2">
        <p class="ym-eyebrow">Project sessions</p>
        <h1 class="ym-page-title">Project Chat</h1>
        <p class="max-w-3xl text-sm text-muted-foreground">
          Durable Pi chat threads grouped by project, backed by harness sessions and replayable run
          streams.
        </p>
      </header>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">${raw(
        cards.join(""),
      )}</div>
    </section>
  `;
}

async function renderProjectPage(
  ctx: PluginContext,
  project: ProjectConfig,
  request: UiRequest,
): Promise<string> {
  const threadId = formValue(request.query.thread);
  if (!threadId) return await renderProjectThreadList(ctx, project);
  const thread = await getThread(ctx, threadId);
  if (!thread || thread.project !== project.slug || thread.archivedAt) {
    return html`
      <div class="ym-alert ym-alert-error">
        Thread not found or archived.
      </div>
    `;
  }
  if (thread.activeRunId && !thread.activeRunId.startsWith("pending:")) {
    try {
      const info = await ctx.harness.get(thread.activeRunId);
      if (info.state !== "running") await finalizeRun(ctx, thread.activeRunId);
    } catch {
      // Render stale state; monitor/finalize action can repair it.
    }
  }
  return await renderThreadPanel(ctx, project, thread.id);
}

async function renderProjectThreadList(
  ctx: PluginContext,
  project: ProjectConfig,
): Promise<string> {
  const threads = await listProjectThreads(ctx, project);
  return html`
    <section class="space-y-6">
      <header class="ym-page-header space-y-3">
        <a
          class="ym-link text-sm"
          href="/plugins/project-chat"
          hx-get="/plugins/project-chat"
          hx-target="#main"
          hx-push-url="true"
        >← Projects</a>
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="space-y-2">
            <p class="ym-eyebrow">Thread list</p>
            <h1 class="ym-page-title">${project.name}</h1>
            <p class="max-w-3xl text-sm text-muted-foreground">${project
              .description}</p>
            <p class="font-mono text-xs text-muted-foreground">${project
              .cwd}</p>
          </div>
          <form
            hx-post="/plugins/project-chat/thread/new"
            hx-target="#main"
            hx-swap="innerHTML"
          >
            <input type="hidden" name="project" value="${project.slug}">
            <button class="ym-button ym-button-primary" type="submit">
              New thread
            </button>
          </form>
        </div>
      </header>
      <div class="ym-panel">
        ${raw(
          threads.length ? threads.map((thread) => threadListItem(project, thread)).join("") : html`
            <div class="p-6 text-sm text-muted-foreground">
              No threads yet. Start one above.
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

function threadListItem(project: ProjectConfig, thread: ChatThread): string {
  return html`
    <a
      class="block border-b p-4 transition last:border-b-0 hover:bg-accent/40"
      href="${projectHref(project, thread.id)}"
      hx-get="${projectHref(project, thread.id)}"
      hx-target="#main"
      hx-push-url="true"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-semibold">${thread.title}</div>
          <div class="mt-1 text-xs text-muted-foreground">Updated ${thread
            .updatedAt}</div>
        </div>
        ${thread.activeRunId
          ? raw(html`
            <span class="ym-badge ym-badge-success">active</span>
          `)
          : raw(html`
            <span class="ym-badge">idle</span>
          `)}
      </div>
    </a>
  `;
}

async function renderThreadPanel(
  ctx: PluginContext,
  project: ProjectConfig,
  threadId: string,
): Promise<string> {
  const thread = await getThread(ctx, threadId);
  if (!thread) {
    return html`
      <div class="ym-alert ym-alert-error">Thread not found.</div>
    `;
  }
  const messages = await getMessages(ctx, threadId);
  const activeRunId = thread.activeRunId && !thread.activeRunId.startsWith("pending:")
    ? thread.activeRunId
    : undefined;
  const streamScript = activeRunId && thread.activeAssistantMessageId
    ? chatStreamScript(activeRunId, thread.activeAssistantMessageId)
    : "";

  return html`
    <section id="thread-panel" class="space-y-6">
      <header class="ym-page-header space-y-3">
        <a
          class="ym-link text-sm"
          href="${projectHref(project)}"
          hx-get="${projectHref(project)}"
          hx-target="#main"
          hx-push-url="true"
        >← ${project.name} threads</a>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="space-y-2">
            <p class="ym-eyebrow">${project.name} thread</p>
            <h1 class="ym-page-title">${thread.title}</h1>
            <p class="font-mono text-xs text-muted-foreground">${thread.cwd}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <form
              class="flex flex-wrap gap-2"
              hx-post="/plugins/project-chat/thread/rename"
              hx-target="#thread-panel"
              hx-swap="outerHTML"
            >
              <input type="hidden" name="project" value="${project.slug}">
              <input type="hidden" name="thread" value="${thread.id}">
              <input
                class="ym-input h-9"
                style="width: min(18rem, 100%);"
                name="title"
                value="${thread.title}"
                aria-label="Thread title"
              >
              <button class="ym-button ym-button-secondary" type="submit">
                Rename
              </button>
            </form>
            <form
              hx-post="/plugins/project-chat/thread/archive"
              hx-target="#main"
              hx-swap="innerHTML"
            >
              <input type="hidden" name="project" value="${project.slug}">
              <input type="hidden" name="thread" value="${thread.id}">
              <button class="ym-button ym-button-secondary" type="submit">
                Archive
              </button>
            </form>
          </div>
        </div>
      </header>
      <div id="messages-${thread.id}" class="ym-panel space-y-4 p-4">
        ${raw(
          messages.length
            ? messages.map((message, index) =>
              renderMessage(project, thread, messages, message, index)
            ).join("")
            : html`
              <div class="text-sm text-muted-foreground">
                No messages yet. Send the first prompt below.
              </div>
            `,
        )}
      </div>
      ${raw(
        activeRunId
          ? renderActiveRunControls(project, thread, activeRunId)
          : renderMessageForm(project, thread),
      )} ${streamScript ? raw(streamScript) : ""}
    </section>
  `;
}

function renderMessage(
  project: ProjectConfig,
  thread: ChatThread,
  messages: ChatMessage[],
  message: ChatMessage,
  index: number,
): string {
  const isAssistant = message.role === "assistant";
  const previousUser = isAssistant
    ? [...messages.slice(0, index)].reverse().find((item) => item.role === "user")
    : undefined;
  const runMeta = message.runId ? `run ${message.runId.slice(0, 8)}` : "";
  return html`
    <article
      id="message-${message.id}"
      class="rounded-md border ${isAssistant ? "bg-muted" : "bg-background"} p-4"
      data-message-id="${message.id}"
      data-run-id="${message.runId ?? ""}"
      data-last-sequence="0"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="ym-eyebrow">${message.role}</div>
        <div
          class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          ${raw(renderStatusBadge(message.status))} ${runMeta
            ? raw(html`
              <span>${runMeta}</span>
            `)
            : ""}
        </div>
      </div>
      <pre
        id="message-content-${message.id}"
        class="overflow-auto whitespace-pre-wrap p-3 text-sm leading-6"
      >${message.content}</pre>
      <div
        id="tools-${message.id}"
        class="mt-3 space-y-1 text-xs text-muted-foreground"
      >
      </div>
      ${message.error
        ? raw(html`
          <div class="ym-alert ym-alert-error mt-3">
            ${message.error}
          </div>
        `)
        : ""} ${message.status === "failed" && previousUser
        ? raw(html`
          <form
            class="mt-3"
            hx-post="/plugins/project-chat/message/send"
            hx-target="#thread-panel"
            hx-swap="outerHTML"
          >
            <input type="hidden" name="project" value="${project.slug}">
            <input type="hidden" name="thread" value="${thread.id}">
            <input type="hidden" name="content" value="${previousUser.content}">
            <button class="ym-button ym-button-secondary" type="submit">
              Retry previous prompt
            </button>
          </form>
        `)
        : ""}
    </article>
  `;
}

function renderMessageForm(project: ProjectConfig, thread: ChatThread): string {
  return html`
    <form
      class="ym-panel space-y-3 p-4"
      hx-post="/plugins/project-chat/message/send"
      hx-target="#thread-panel"
      hx-swap="outerHTML"
    >
      <input type="hidden" name="project" value="${project.slug}">
      <input type="hidden" name="thread" value="${thread.id}">
      <label class="block space-y-2">
        <span class="text-sm font-medium">Message Pi</span>
        <textarea
          class="ym-input font-mono"
          style="min-height: 7rem;"
          name="content"
          required
        ></textarea>
        <span class="text-xs text-muted-foreground">
          Prompts run in ${project
            .cwd}; files, commands, and tool output stay on this thread.
        </span>
      </label>
      <button class="ym-button ym-button-primary" type="submit">
        Send
      </button>
    </form>
  `;
}

function renderActiveRunControls(
  project: ProjectConfig,
  thread: ChatThread,
  runId: string,
): string {
  return html`
    <div
      class="ym-panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
    >
      <div>
        <div class="ym-badge ym-badge-success">running</div>
        <div class="mt-2 font-medium">Run active</div>
        <div class="font-mono text-xs text-muted-foreground">${runId}</div>
      </div>
      <form
        hx-post="/plugins/project-chat/run/cancel"
        hx-target="#thread-panel"
        hx-swap="outerHTML"
      >
        <input type="hidden" name="project" value="${project.slug}">
        <input type="hidden" name="thread" value="${thread.id}">
        <input type="hidden" name="run" value="${runId}">
        <button class="ym-button ym-button-danger" type="submit">
          Cancel run
        </button>
      </form>
    </div>
  `;
}

function chatStreamScript(runId: string, assistantMessageId: string): string {
  return `<script>(() => {
    const runId = ${JSON.stringify(runId)};
    const messageId = ${JSON.stringify(assistantMessageId)};

    function readOutputText(info) {
      const result = info && info.result ? info.result : info;
      return (result && (result.outputText || result.output_text)) || "";
    }

    async function refreshFinalOutput(output) {
      if (output && output.textContent.trim()) return;
      try {
        const response = await fetch("/api/harness-runs/" + encodeURIComponent(runId));
        if (!response.ok) return;
        const info = await response.json();
        const text = readOutputText(info);
        if (text && output) output.textContent = text;
      } catch (_) {
        // Best-effort fallback only.
      }
    }

    function connect(attempt) {
      const article = document.getElementById("message-" + messageId);
      const output = document.getElementById("message-content-" + messageId);
      const tools = document.getElementById("tools-" + messageId);

      if (!article || !output) {
        if (attempt < 40) window.setTimeout(() => connect(attempt + 1), 50);
        return;
      }
      if (article.dataset.streaming === "true") return;
      article.dataset.streaming = "true";

      let lastSeq = Number(article.dataset.lastSequence || "0");
      let deltaMode = "unknown";
      const status = document.createElement("div");
      status.className = "mt-2 text-xs text-muted-foreground";
      article.appendChild(status);

      const setStatus = (value) => {
        status.textContent = value || "";
      };
      const parse = (message) => JSON.parse(message.data);
      const setSeq = (message) => {
        if (message.lastEventId) {
          lastSeq = Number(message.lastEventId);
          article.dataset.lastSequence = String(lastSeq);
        }
      };
      const addTool = (text) => {
        if (!tools) return;
        const item = document.createElement("div");
        item.className = "rounded-md border bg-background px-2 py-1";
        item.textContent = text;
        tools.appendChild(item);
      };

      const open = () => {
        const source = new EventSource(
          "/api/harness-runs/" + encodeURIComponent(runId) + "/events?after=" +
            encodeURIComponent(String(lastSeq)),
        );

        const finalize = async (state) => {
          setStatus(state || "completed");
          source.close();
          try {
            const body = new URLSearchParams({ run: runId });
            await fetch("/plugins/project-chat/run/finalize", { method: "POST", body });
          } catch (_) {
            setStatus((state || "completed") + " (finalize failed; reload to repair)");
          }
          await refreshFinalOutput(output);
          article.dataset.streaming = "";
        };

        source.addEventListener("started", (message) => {
          setSeq(message);
          setStatus("streaming");
        });
        source.addEventListener("text_delta", (message) => {
          setSeq(message);
          if (deltaMode === "raw") return;
          deltaMode = "normalized";
          const event = parse(message);
          output.textContent += event.delta || "";
          setStatus("streaming");
        });
        source.addEventListener("raw_event", (message) => {
          setSeq(message);
          if (deltaMode === "normalized") return;
          const event = parse(message);
          const raw = event.event || {};
          const delta = raw.assistantMessageEvent && raw.assistantMessageEvent.delta;
          if (typeof delta === "string" && delta.length > 0) {
            deltaMode = "raw";
            output.textContent += delta;
            setStatus("streaming");
          }
        });
        source.addEventListener("tool_call_start", (message) => {
          setSeq(message);
          const event = parse(message);
          const tool = event.tool_call || event.toolCall || {};
          addTool((tool.tool_name || tool.toolName || "tool") + " started");
        });
        source.addEventListener("tool_call_end", (message) => {
          setSeq(message);
          const event = parse(message);
          const tool = event.tool_call || event.toolCall || {};
          addTool((tool.tool_name || tool.toolName || "tool") + " finished");
        });
        source.addEventListener("completed", (message) => {
          setSeq(message);
          const event = parse(message);
          const text = readOutputText(event);
          if (text && !output.textContent.trim()) output.textContent = text;
          void finalize("completed");
        });
        source.addEventListener("failed", (message) => {
          setSeq(message);
          try {
            const event = parse(message);
            if (event.error) setStatus("failed: " + event.error);
          } catch (_) {
            setStatus("failed");
          }
          void finalize("failed");
        });
        source.addEventListener("cancelled", (message) => {
          setSeq(message);
          void finalize("cancelled");
        });
        source.addEventListener("interrupted", (message) => {
          setSeq(message);
          void finalize("interrupted");
        });
        source.addEventListener("lagged", (message) => {
          setSeq(message);
          setStatus("stream lagged; reconnecting…");
          source.close();
          window.setTimeout(open, 500);
        });
        source.onerror = () => {
          setStatus("stream disconnected; retrying…");
          source.close();
          window.setTimeout(open, 1500);
        };
      };

      open();
    }

    window.setTimeout(() => connect(0), 0);
  })();</script>`;
}

async function actionNewThread(ctx: PluginContext, request: UiRequest) {
  const slug = formValue(request.form?.project) ?? "";
  const project = PROJECT_BY_SLUG.get(slug);
  if (!project) return { html: "Unknown project", status: 400 };
  const thread = await createThread(ctx, project);
  return {
    html: "",
    headers: { "HX-Redirect": projectHref(project, thread.id) },
  };
}

async function actionSendMessage(ctx: PluginContext, request: UiRequest) {
  const project = PROJECT_BY_SLUG.get(formValue(request.form?.project) ?? "");
  const threadId = formValue(request.form?.thread) ?? "";
  const content = (formValue(request.form?.content) ?? "").trim();
  if (!project || !threadId || !content) {
    return { html: "Missing project, thread, or content", status: 400 };
  }
  const thread = await getThread(ctx, threadId);
  if (!thread || thread.project !== project.slug) {
    return { html: "Thread not found", status: 404 };
  }
  await startChatRun(ctx, project, thread, content);
  return await renderThreadPanel(ctx, project, threadId);
}

async function actionFinalizeRun(ctx: PluginContext, request: UiRequest) {
  const runId = formValue(request.form?.run) ?? "";
  if (!runId) return { html: "Missing run", status: 400 };
  const result = await finalizeRun(ctx, runId);
  return html`
    <span class="ym-badge">${result.state}</span>
  `;
}

async function actionCancelRun(ctx: PluginContext, request: UiRequest) {
  const project = PROJECT_BY_SLUG.get(formValue(request.form?.project) ?? "");
  const threadId = formValue(request.form?.thread) ?? "";
  const runId = formValue(request.form?.run) ?? "";
  if (!project || !threadId || !runId) {
    return { html: "Missing project, thread, or run", status: 400 };
  }
  await ctx.harness.cancel(runId).catch(() => undefined);
  return await renderThreadPanel(ctx, project, threadId);
}

async function actionArchiveThread(ctx: PluginContext, request: UiRequest) {
  const project = PROJECT_BY_SLUG.get(formValue(request.form?.project) ?? "");
  const threadId = formValue(request.form?.thread) ?? "";
  if (!project || !threadId) {
    return { html: "Missing project or thread", status: 400 };
  }
  await ctx.kv.update<ChatThread>(threadKey(threadId), (thread) => {
    if (!thread) throw new Error("Thread not found");
    return { ...thread, archivedAt: nowIso(), updatedAt: nowIso() };
  });
  return { html: "", headers: { "HX-Redirect": projectHref(project) } };
}

async function actionRenameThread(ctx: PluginContext, request: UiRequest) {
  const project = PROJECT_BY_SLUG.get(formValue(request.form?.project) ?? "");
  const threadId = formValue(request.form?.thread) ?? "";
  const title = (formValue(request.form?.title) ?? DEFAULT_THREAD_TITLE).trim().slice(
    0,
    96,
  ) ||
    DEFAULT_THREAD_TITLE;
  if (!project || !threadId) {
    return { html: "Missing project or thread", status: 400 };
  }
  await ctx.kv.update<ChatThread>(threadKey(threadId), (thread) => {
    if (!thread) throw new Error("Thread not found");
    return { ...thread, title, updatedAt: nowIso() };
  });
  return await renderThreadPanel(ctx, project, threadId);
}

export default definePlugin((plugin) => {
  plugin.page("/", {
    title: "Project Chat",
    navTitle: "Project Chat",
    render: async (ctx) => await renderIndex(ctx),
  });

  for (const project of PROJECTS) {
    plugin.page(`/${project.slug}`, {
      title: `${project.name} Chat`,
      navTitle: project.name,
      render: async (ctx, request) => await renderProjectPage(ctx, project, request),
    });
  }

  plugin.action("/thread/new", { post: actionNewThread });
  plugin.action("/message/send", { post: actionSendMessage });
  plugin.action("/run/finalize", { post: actionFinalizeRun });
  plugin.action("/run/cancel", { post: actionCancelRun });
  plugin.action("/thread/archive", { post: actionArchiveThread });
  plugin.action("/thread/rename", { post: actionRenameThread });

  plugin.schedule("finalize-active-runs", "*/30 * * * * *", async (ctx) => {
    await finalizeActiveRuns(ctx);
  });
});
