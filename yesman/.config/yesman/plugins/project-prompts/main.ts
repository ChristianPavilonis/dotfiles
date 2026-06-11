import {
  definePlugin,
  type HarnessToolCall,
  html,
  type PluginContext,
  raw,
  type UiRequest,
} from "@yesman/sdk";

const PLUGIN_NAME = "project-prompts";
const MAX_PROMPT_LENGTH = 16_000;
const MAX_RECENT_RUNS = 5;
const MAX_STORED_TEXT_LENGTH = 6_000;

const VAULT_PATH = "/home/christian/Documents/MyObsidianVault";

type ProjectConfig = {
  slug: string;
  projectSlug: string;
  name: string;
  cwd: string;
  description: string;
  context: string;
};

type RecentRun = {
  id: string;
  project: string;
  prompt: string;
  output: string;
  startedAt: string;
  completedAt: string;
  toolCallCount: number;
};

const PROJECTS: ProjectConfig[] = [
  {
    slug: "rigzilla",
    projectSlug: "rigzilla",
    name: "Rigzilla",
    cwd: "/home/christian/projects/rigzilla",
    description: "Rigzilla application repository.",
    context: "Code project. Inspect or edit the repository as requested.",
  },
  {
    slug: "trusted-server",
    projectSlug: "trusted-server",
    name: "Trusted Server",
    cwd: "/home/christian/projects/trusted-server",
    description: "Trusted Server repository.",
    context: "Code project. Inspect or edit the repository as requested.",
  },
  {
    slug: "scrapezilla",
    projectSlug: "scrapezilla",
    name: "Scrapezilla",
    cwd: "/home/christian/projects/scrapezilla",
    description: "Scrapezilla repository.",
    context: "Code project. Inspect or edit the repository as requested.",
  },
  {
    slug: "tauri-tutorials",
    projectSlug: "tauritutorials",
    name: "Tauri Tutorials",
    cwd: VAULT_PATH,
    description: "Obsidian-tracked Tauri Tutorials project notes.",
    context:
      "Knowledge project. Use the Obsidian vault as context and focus on notes whose frontmatter project is tauritutorials.",
  },
  {
    slug: "ideas",
    projectSlug: "ideas",
    name: "Ideas",
    cwd: VAULT_PATH,
    description: "Obsidian-tracked idea backlog and reference notes.",
    context:
      "Knowledge project. Use the Obsidian vault as context and focus on notes whose frontmatter project is ideas.",
  },
  {
    slug: "yesman",
    projectSlug: "yesman",
    name: "YesMan",
    cwd: "/home/christian/projects/yesman",
    description: "Yesman daemon, plugin runtime, and UI repository.",
    context: "Code project. Inspect or edit the repository as requested.",
  },
];

export default definePlugin((plugin) => {
  plugin.page("/", {
    title: "Project Prompts",
    navTitle: "Project Prompts",
    render: renderIndexPage,
  });

  for (const project of PROJECTS) {
    plugin.page(`/${project.slug}`, {
      title: `${project.name} Prompt`,
      navTitle: project.name,
      render: (ctx) => renderProjectPage(ctx, project),
    });
  }

  plugin.action("/run", {
    post: runProjectPrompt,
  });

  plugin.action("/clear-history", {
    post: clearProjectHistory,
  });

  plugin.on("system.started", async (ctx) => {
    await ctx.log("project prompts plugin ready", {
      projects: PROJECTS.map((project) => ({
        slug: project.slug,
        cwd: project.cwd,
      })),
    });
  });
});

async function renderIndexPage(ctx: PluginContext): Promise<string> {
  const cards = await Promise.all(PROJECTS.map(async (project) => {
    const recentRuns = await getRecentRuns(ctx, project.slug);
    return raw(html`
      <a
        class="block rounded-lg border bg-card p-5 text-card-foreground shadow-sm transition hover:border-primary/60 hover:shadow-md"
        href="/plugins/${PLUGIN_NAME}/${project.slug}"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold tracking-tight">${project
              .name}</h2>
            <p class="mt-1 text-sm text-muted-foreground">${project
              .description}</p>
          </div>
          <span
            class="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
          >
            ${recentRuns.length} recent
          </span>
        </div>
        <div
          class="mt-4 rounded-md bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground"
        >
          ${project.cwd}
        </div>
      </a>
    `);
  }));

  return html`
    <section class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Project Prompts</h1>
        <p class="mt-2 max-w-3xl text-sm text-muted-foreground">
          Send short, one-shot prompts to the default Pi harness with a
          project-specific working directory. This first prototype runs inside the
          current UI action timeout, so keep prompts focused.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${cards}
      </div>
    </section>
  `;
}

async function renderProjectPage(
  ctx: PluginContext,
  project: ProjectConfig,
): Promise<string> {
  const recentRuns = await getRecentRuns(ctx, project.slug);
  const resultId = `run-result-${project.slug}`;

  return html`
    <section class="space-y-6">
      <div
        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      >
        <div>
          <a
            class="text-sm text-muted-foreground hover:text-foreground"
            href="/plugins/${PLUGIN_NAME}"
          >
            ← All projects
          </a>
          <h1 class="mt-2 text-3xl font-bold tracking-tight">${project
            .name}</h1>
          <p class="mt-2 max-w-3xl text-sm text-muted-foreground">${project
            .description}</p>
        </div>
        <div
          class="rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground shadow-sm"
        >
          <div
            class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Working directory
          </div>
          <div class="mt-1 font-mono text-xs">${project.cwd}</div>
        </div>
      </div>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <form
            class="space-y-5"
            hx-post="/plugins/${PLUGIN_NAME}/run"
            hx-target="#${resultId}"
            hx-swap="innerHTML"
          >
            <input type="hidden" name="project" value="${project.slug}" />

            <div class="space-y-2">
              <label class="text-sm font-medium" for="prompt-${project.slug}"
              >Prompt</label>
              <textarea
                id="prompt-${project.slug}"
                name="prompt"
                rows="10"
                maxlength="${MAX_PROMPT_LENGTH}"
                class="min-h-48 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="${samplePrompt(project)}"
                required
              ></textarea>
              <p class="text-xs text-muted-foreground">
                Uses the default Pi harness configuration. One-shot mode waits for
                the Pi run to finish before showing the result, so quick prompts
                work best.
              </p>
            </div>

            <div
              class="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground"
            >
              ${project.context}
            </div>

            <div class="flex items-center gap-3">
              <button
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                type="submit"
              >
                Run one-shot prompt
              </button>
              <span class="text-xs text-muted-foreground"
              >Results appear below.</span>
            </div>
          </form>

          <div id="${resultId}" class="mt-6"></div>
        </div>

        <aside class="space-y-4">
          <div class="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold tracking-tight">Recent runs</h2>
                <p class="text-xs text-muted-foreground">
                  Last ${MAX_RECENT_RUNS} saved for this project.
                </p>
              </div>
              <form
                hx-post="/plugins/${PLUGIN_NAME}/clear-history"
                hx-target="#recent-runs-${project.slug}"
                hx-swap="innerHTML"
              >
                <input type="hidden" name="project" value="${project.slug}" />
                <button
                  class="text-xs text-muted-foreground hover:text-foreground"
                  type="submit"
                >
                  Clear
                </button>
              </form>
            </div>
            <div id="recent-runs-${project.slug}" class="mt-4">
              ${renderRecentRuns(recentRuns)}
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

async function runProjectPrompt(
  ctx: PluginContext,
  request: UiRequest,
): Promise<string> {
  const projectSlug = formString(request, "project");
  const prompt = formString(request, "prompt");
  const project = PROJECTS.find((item) => item.slug === projectSlug);

  if (!project) {
    return renderError(
      "Unknown project",
      "Choose a project page and try again.",
    );
  }
  if (!prompt.trim()) {
    return renderError(
      "Prompt required",
      "Write a prompt before starting the one-shot run.",
    );
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return renderError(
      "Prompt too long",
      `Keep prompts under ${MAX_PROMPT_LENGTH.toLocaleString()} characters for this prototype.`,
    );
  }

  const startedAt = new Date().toISOString();

  await ctx.log("project prompt started", {
    project: project.slug,
    cwd: project.cwd,
    promptLength: prompt.length,
  });

  try {
    const result = await ctx.harness.run("pi", {
      prompt: buildHarnessPrompt(project, prompt),
      cwd: project.cwd,
    });
    const completedAt = new Date().toISOString();
    const recentRun: RecentRun = {
      id: crypto.randomUUID(),
      project: project.slug,
      prompt: truncate(prompt.trim(), MAX_STORED_TEXT_LENGTH),
      output: truncate(result.outputText.trim(), MAX_STORED_TEXT_LENGTH),
      startedAt,
      completedAt,
      toolCallCount: result.toolCalls.length,
    };
    await addRecentRun(ctx, recentRun);
    await ctx.log("project prompt completed", {
      project: project.slug,
      outputLength: result.outputText.length,
      toolCallCount: result.toolCalls.length,
    });

    return html`
      <div
        class="space-y-4 rounded-lg border bg-card p-5 text-card-foreground shadow-sm"
      >
        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold tracking-tight">Result</h2>
            <p class="text-xs text-muted-foreground">
              ${project.name} · default Pi harness · ${result.toolCalls
                .length} tool calls
            </p>
          </div>
          <span
            class="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800"
          >
            Completed
          </span>
        </div>

        <pre
          class="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-6"
        >${result.outputText.trim()}</pre>

        ${renderToolCalls(result.toolCalls)}

        <p class="text-xs text-muted-foreground">
          Saved to recent runs. Reload this project page to see the sidebar history
          update.
        </p>
      </div>
    `;
  } catch (error) {
    const message = errorMessage(error);
    await ctx.log("project prompt failed", {
      project: project.slug,
      error: message,
    });
    return renderError("Pi run failed", message);
  }
}

async function clearProjectHistory(
  ctx: PluginContext,
  request: UiRequest,
): Promise<string> {
  const projectSlug = formString(request, "project");
  const project = PROJECTS.find((item) => item.slug === projectSlug);
  if (!project) return renderError("Unknown project", "Nothing was cleared.");
  await ctx.kv.delete(recentRunsKey(project.slug));
  await ctx.log("project prompt history cleared", { project: project.slug });
  return renderRecentRuns([]);
}

function buildHarnessPrompt(
  project: ProjectConfig,
  userPrompt: string,
): string {
  return [
    "You are a one-shot Pi agent launched from the YesMan Project Prompts UI.",
    "Use the default Pi harness/tool configuration.",
    "Keep the final answer focused and useful.",
    "Do not modify files unless the user explicitly asks for changes.",
    "If you change files, summarize changed files and validation run.",
    "",
    `Project: ${project.name}`,
    `Project slug: ${project.projectSlug}`,
    `Working directory: ${project.cwd}`,
    `Project context: ${project.context}`,
    "",
    "User prompt:",
    userPrompt.trim(),
  ].join("\n");
}

function samplePrompt(project: ProjectConfig): string {
  if (project.cwd === VAULT_PATH) {
    return `Find the most important open notes for ${project.name} and summarize what I should look at next.`;
  }
  return `Inspect this project and tell me the next small thing I should improve in ${project.name}.`;
}

function renderRecentRuns(runs: RecentRun[]): string {
  if (runs.length === 0) {
    return html`
      <p class="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        No recent prompts yet.
      </p>
    `;
  }

  const items = runs.map((run) =>
    raw(html`
      <details class="rounded-md border bg-background p-3 text-sm">
        <summary class="cursor-pointer list-none">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-medium">${firstLine(run.prompt)}</div>
              <div class="mt-1 text-xs text-muted-foreground">
                ${formatDate(run.completedAt)} · default Pi harness · ${run
                  .toolCallCount} tools
              </div>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground">Details</span>
          </div>
        </summary>
        <div class="mt-3 space-y-2 border-t pt-3">
          <div>
            <div class="mb-1 text-xs font-medium text-muted-foreground">Prompt</div>
            <pre
              class="max-h-36 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs"
            >${run.prompt}</pre>
          </div>
          <div>
            <div class="mb-1 text-xs font-medium text-muted-foreground">Output</div>
            <pre
              class="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs"
            >${run.output}</pre>
          </div>
        </div>
      </details>
    `)
  );

  return html`
    <div class="space-y-3">${items}</div>
  `;
}

function renderToolCalls(toolCalls: HarnessToolCall[]) {
  if (toolCalls.length === 0) return "";
  const calls = toolCalls.map((toolCall) =>
    raw(html`
      <li class="rounded bg-muted px-2 py-1 font-mono text-xs">
        ${toolCall.toolName}
      </li>
    `)
  );
  return raw(html`
    <div>
      <div
        class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        Tool calls
      </div>
      <ul class="flex flex-wrap gap-2">${calls}</ul>
    </div>
  `);
}

function renderError(title: string, message: string): string {
  return html`
    <div
      class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <div class="font-semibold">${title}</div>
      <p class="mt-1 whitespace-pre-wrap">${message}</p>
    </div>
  `;
}

async function getRecentRuns(
  ctx: PluginContext,
  project: string,
): Promise<RecentRun[]> {
  const value = await ctx.kv.get<unknown>(recentRunsKey(project));
  if (!Array.isArray(value)) return [];
  return value.filter(isRecentRun).slice(0, MAX_RECENT_RUNS);
}

async function addRecentRun(ctx: PluginContext, run: RecentRun): Promise<void> {
  const runs = await getRecentRuns(ctx, run.project);
  await ctx.kv.set(
    recentRunsKey(run.project),
    [run, ...runs].slice(0, MAX_RECENT_RUNS),
  );
}

function recentRunsKey(project: string): string {
  return `recent:${project}`;
}

function formString(request: UiRequest, key: string): string {
  const value = request.form?.[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function isRecentRun(value: unknown): value is RecentRun {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const run = value as Partial<RecentRun>;
  return typeof run.id === "string" &&
    typeof run.project === "string" &&
    typeof run.prompt === "string" &&
    typeof run.output === "string" &&
    typeof run.startedAt === "string" &&
    typeof run.completedAt === "string" &&
    typeof run.toolCallCount === "number";
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() || "Untitled prompt";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + "…";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
