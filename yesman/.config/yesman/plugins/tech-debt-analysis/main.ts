import {
  definePlugin,
  type HarnessRunResult,
  type PluginContext,
  type PluginEvent,
} from "@yesman/sdk";
import { extname, join } from "node:path";

const DEFAULT_HARNESS_NAME = "pi";
const WEEKLY_SCHEDULE = "0 9 * * 1";
const RESULT_MARKER = "TECH_DEBT_RESULT:";
const DEFAULT_THINKING = "high";
const DEFAULT_MAX_REPOS_PER_RUN = 1;
const DEFAULT_ISSUE_LABEL = "tech-debt";
const DEFAULT_AGENT_TIMEOUT_MINUTES = 120;
const DEFAULT_MAX_FILE_BYTES = 250_000;
const DEFAULT_AGENT_TOOLS = ["read", "bash", "ffgrep", "fffind"];

const DEFAULT_REPOSITORIES: RepositoryConfig[] = [
  {
    name: "rigzilla",
    cwd: "/home/christian/projects/rigzilla",
    repo: "ChristianPavilonis/rigzilla",
    enabled: true,
    includePaths: [
      "app",
      "database",
      "resources",
      "routes",
      "src-tauri/src",
      "tests",
    ],
  },
];

const SOURCE_EXTENSIONS = new Set([
  ".astro",
  ".c",
  ".cc",
  ".clj",
  ".cljs",
  ".cpp",
  ".cs",
  ".css",
  ".dart",
  ".ex",
  ".exs",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".lua",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scala",
  ".scss",
  ".svelte",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
]);

const EXCLUDED_DIR_PARTS = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "public/build",
  "storage",
  "target",
  "tmp",
  "vendor",
]);

const EXCLUDED_FILENAMES = new Set([
  ".dockerignore",
  ".gitignore",
  ".npmignore",
  "bun.lock",
  "cargo.lock",
  "composer.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock",
]);

type RepositoryConfig = {
  name: string;
  cwd: string;
  repo: string;
  enabled: boolean;
  includePaths: string[];
};

type Settings = {
  enabled: boolean;
  repositories: RepositoryConfig[];
  harnessName: string;
  thinking: string;
  provider?: string;
  model?: string;
  tools: string[];
  maxReposPerRun: number;
  issueLabel: string;
  agentTimeoutMinutes: number;
  maxFileBytes: number;
};

type CommandResult = {
  command: string;
  args: string[];
  cwd?: string;
  code: number;
  stdout: string;
  stderr: string;
};

type TechDebtResultMarker = {
  issue_url?: unknown;
  starting_file?: unknown;
  summary?: unknown;
};

type VerifiedIssue = {
  url: string;
  title?: string;
  state?: string;
};

class CommandError extends Error {
  result: CommandResult;

  constructor(result: CommandResult) {
    const rendered = [result.command, ...result.args].join(" ");
    super(
      `command failed (${result.code}): ${rendered}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    this.name = "CommandError";
    this.result = result;
  }
}

let runInFlight = false;

export default definePlugin((plugin) => {
  plugin.schedule("weekly-tech-debt-analysis", WEEKLY_SCHEDULE, {
    type: "tech-debt-analysis.run",
    payload: { reason: "weekly schedule" },
  });

  plugin.on("system.started", async (ctx) => {
    await ctx.log("tech debt analysis plugin ready", {
      event: "tech-debt-analysis.run",
      schedule: "weekly-tech-debt-analysis",
      cron: WEEKLY_SCHEDULE,
    });
  });

  plugin.on("tech-debt-analysis.run", handleRun);
});

async function handleRun(
  ctx: PluginContext,
  event: PluginEvent,
): Promise<void> {
  if (runInFlight) {
    await ctx.log("tech-debt-analysis run skipped: another run is in flight", {
      event: event.id,
    });
    return;
  }

  runInFlight = true;
  const startedAt = new Date().toISOString();

  try {
    const payload = eventPayload(event);
    const settings = await getSettings(ctx, payload);
    const force = asBoolean(payloadValue(payload, "force"), false);
    const week = asString(payloadValue(payload, "week"), isoWeekString());

    if (!settings.enabled && !force) {
      await ctx.log("tech-debt-analysis disabled; skipping run");
      await ctx.emit({
        type: "tech-debt-analysis.run.completed",
        payload: { skipped: true, reason: "disabled", started_at: startedAt },
      });
      return;
    }

    const repoFilter = getRepoFilter(payload);
    const repositories = settings.repositories
      .filter((repo) => repo.enabled)
      .filter((repo) => {
        if (repoFilter === null) return true;
        return repoFilter.has(repo.name) || repoFilter.has(repo.repo);
      })
      .slice(0, settings.maxReposPerRun);

    await ctx.emit({
      type: "tech-debt-analysis.run.started",
      payload: {
        reason: asString(payloadValue(payload, "reason"), "unknown"),
        started_at: startedAt,
        week,
        force,
        repositories: repositories.map((repo) => ({
          name: repo.name,
          repo: repo.repo,
          cwd: repo.cwd,
          include_paths: repo.includePaths,
        })),
      },
    });

    let started = 0;
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const repo of repositories) {
      const stateKey = weeklyStateKey(repo, week);
      const priorState = await ctx.kv.get<Record<string, unknown>>(stateKey);
      if (!force && priorState?.status === "completed") {
        skipped++;
        results.push({
          repo: repo.name,
          status: "skipped",
          reason: "already completed for week",
          issue_url: priorState.issue_url,
        });
        await ctx.emit({
          type: "tech-debt-analysis.repo.skipped",
          payload: {
            repo: repo.repo,
            repo_name: repo.name,
            cwd: repo.cwd,
            week,
            reason: "already completed for week",
            issue_url: priorState.issue_url,
          },
        });
        continue;
      }

      started++;
      try {
        const result = await analyzeRepository(
          ctx,
          settings,
          repo,
          week,
          stateKey,
        );
        completed++;
        results.push({ repo: repo.name, status: "completed", ...result });
      } catch (error) {
        failed++;
        const completedAt = new Date().toISOString();
        const errorText = stringifyError(error);
        await ctx.kv.set(stateKey, {
          repo: repo.repo,
          repo_name: repo.name,
          cwd: repo.cwd,
          week,
          status: "failed",
          started_at: startedAt,
          completed_at: completedAt,
          error: errorText,
        });
        await ctx.emit({
          type: "tech-debt-analysis.repo.failed",
          payload: {
            repo: repo.repo,
            repo_name: repo.name,
            cwd: repo.cwd,
            week,
            completed_at: completedAt,
            error: errorText,
          },
        });
        await ctx.log("tech-debt-analysis repo failed", {
          repo: repo.repo,
          cwd: repo.cwd,
          week,
          error: errorText,
        });
        results.push({ repo: repo.name, status: "failed", error: errorText });
      }
    }

    const completedAt = new Date().toISOString();
    await ctx.emit({
      type: "tech-debt-analysis.run.completed",
      payload: {
        started_at: startedAt,
        completed_at: completedAt,
        week,
        repo_count: repositories.length,
        started,
        completed,
        skipped,
        failed,
        results,
      },
    });
    await ctx.log("tech-debt-analysis run completed", {
      started_at: startedAt,
      completed_at: completedAt,
      week,
      repo_count: repositories.length,
      started,
      completed,
      skipped,
      failed,
      results,
    });
  } finally {
    runInFlight = false;
  }
}

async function analyzeRepository(
  ctx: PluginContext,
  settings: Settings,
  repo: RepositoryConfig,
  week: string,
  stateKey: string,
): Promise<Record<string, unknown>> {
  await ensureGitRepo(repo.cwd);
  const startingFile = await chooseRandomSourceFile(
    repo.cwd,
    settings.maxFileBytes,
    repo.includePaths,
  );
  const repoStatusBefore = await gitStatus(repo.cwd);
  const startedAt = new Date().toISOString();

  await ctx.kv.set(stateKey, {
    repo: repo.repo,
    repo_name: repo.name,
    cwd: repo.cwd,
    week,
    starting_file: startingFile,
    include_paths: repo.includePaths,
    status: "started",
    started_at: startedAt,
  });

  await ctx.emit({
    type: "tech-debt-analysis.repo.started",
    payload: {
      repo: repo.repo,
      repo_name: repo.name,
      cwd: repo.cwd,
      week,
      starting_file: startingFile,
      include_paths: repo.includePaths,
      started_at: startedAt,
    },
  });

  const prompt = buildAgentPrompt(repo, startingFile, settings.issueLabel);
  const harnessResult = await runHarnessWithTimeout(
    ctx,
    settings,
    repo.cwd,
    prompt,
  );
  const repoStatusAfter = await gitStatus(repo.cwd);
  if (repoStatusAfter !== repoStatusBefore) {
    throw new Error(
      `agent changed repository working tree; before=${
        JSON.stringify(repoStatusBefore)
      } after=${JSON.stringify(repoStatusAfter)}`,
    );
  }

  const marker = extractResultMarker(harnessResult.outputText);
  const issueUrl = markerIssueUrl(marker) ??
    extractIssueUrl(harnessResult.outputText);
  if (!issueUrl) {
    await ctx.log("tech-debt-analysis completed without result marker", {
      repo: repo.repo,
      starting_file: startingFile,
      output_tail: tail(harnessResult.outputText, 4000),
    });
    throw new Error("Pi run completed, but no GitHub issue URL was reported");
  }

  const verifiedIssue = await verifyIssueUrl(repo, issueUrl);
  const completedAt = new Date().toISOString();
  const summary = markerSummary(marker);

  await ctx.kv.set(stateKey, {
    repo: repo.repo,
    repo_name: repo.name,
    cwd: repo.cwd,
    week,
    starting_file: markerStartingFile(marker) ?? startingFile,
    include_paths: repo.includePaths,
    issue_url: verifiedIssue.url,
    issue_title: verifiedIssue.title,
    issue_state: verifiedIssue.state,
    summary,
    status: "completed",
    started_at: startedAt,
    completed_at: completedAt,
    tool_calls: harnessResult.toolCalls.length,
  });

  const payload = {
    repo: repo.repo,
    repo_name: repo.name,
    cwd: repo.cwd,
    week,
    starting_file: markerStartingFile(marker) ?? startingFile,
    include_paths: repo.includePaths,
    issue_url: verifiedIssue.url,
    issue_title: verifiedIssue.title,
    issue_state: verifiedIssue.state,
    summary,
    started_at: startedAt,
    completed_at: completedAt,
  };
  await ctx.emit({ type: "tech-debt-analysis.repo.completed", payload });
  await ctx.log("tech-debt-analysis repo completed", payload);
  return payload;
}

async function runHarnessWithTimeout(
  ctx: PluginContext,
  settings: Settings,
  cwd: string,
  prompt: string,
): Promise<HarnessRunResult> {
  const input = {
    prompt,
    cwd,
    thinking: settings.thinking,
    tools: settings.tools,
    ...(settings.provider ? { provider: settings.provider } : {}),
    ...(settings.model ? { model: settings.model } : {}),
  };

  const run = await ctx.harness.start(settings.harnessName, input);
  await ctx.log("tech-debt-analysis Pi harness run started", {
    runId: run.runId,
    cwd,
    thinking: settings.thinking,
    tools: settings.tools,
    timeoutMinutes: settings.agentTimeoutMinutes,
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void ctx.harness.cancel(run.runId).catch((error: unknown) => {
      void ctx.log(
        "tech-debt-analysis failed to cancel timed out harness run",
        {
          runId: run.runId,
          error: stringifyError(error),
        },
      );
    });
  }, settings.agentTimeoutMinutes * 60_000);

  let rawEventCount = 0;
  let toolCallCount = 0;
  let result: HarnessRunResult | undefined;

  try {
    for await (const streamEvent of ctx.harness.stream(run.runId)) {
      switch (streamEvent.type) {
        case "raw_event":
          rawEventCount++;
          break;
        case "tool_call_start":
          toolCallCount++;
          await ctx.log("tech-debt-analysis Pi tool call", {
            runId: run.runId,
            toolName: streamEvent.toolCall.toolName,
            args: streamEvent.toolCall.args,
          });
          break;
        case "completed":
          result = streamEvent.result;
          break;
        case "failed":
          throw new Error(streamEvent.error);
        case "cancelled":
          throw new Error(
            timedOut
              ? `Pi harness run timed out after ${settings.agentTimeoutMinutes} minutes`
              : "Pi harness run cancelled",
          );
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const status = await ctx.harness.status(run.runId);
  if (status.state !== "completed") {
    throw new Error(`Pi harness ended in unexpected state: ${status.state}`);
  }

  const completedResult = result ?? status.result;
  if (!completedResult) {
    throw new Error("Pi harness completed without a result");
  }

  await ctx.log("tech-debt-analysis Pi harness run completed", {
    runId: run.runId,
    rawEventCount,
    toolCallCount,
    outputLength: completedResult.outputText.length,
  });
  return completedResult;
}

function buildAgentPrompt(
  repo: RepositoryConfig,
  startingFile: string,
  issueLabel: string,
): string {
  return `You are doing Christian's weekly tech-debt analysis for a configured repository.

Repository: ${repo.repo}
Working directory: ${repo.cwd}
Starting file: ${startingFile}
Eligible starting-file paths: ${
    repo.includePaths.length > 0
      ? repo.includePaths.join(", ")
      : "all source paths"
  }

Hard constraints:
- Start by reading the selected starting file.
- Use it as the entry point. Follow imports, call sites, tests, and nearby modules only as needed.
- Your goal is NOT a broad audit.
- Find exactly one actionable tech-debt issue or refactor worth doing.
- Do not modify files.
- Do not open a PR.
- Do not create more than one GitHub issue.
- Open exactly one GitHub issue before finishing.

Issue requirements:
- Use \`gh issue create --repo ${repo.repo}\` non-interactively with explicit \`--title\` and \`--body\` arguments.
- Suggested title format: \`Tech debt: <specific actionable refactor>\`.
- Apply label \`${issueLabel}\` if it exists. If creating the issue with the label fails, retry without the label instead of failing the task.
- The issue body must include:
  - Starting file: \`${startingFile}\`
  - The specific problem
  - Why it matters
  - Suggested refactor/fix
  - Acceptance criteria
  - Relevant files inspected

Quality bar:
- The issue should be concrete enough that a developer can start implementation without a second discovery pass.
- Prefer a small, focused refactor or cleanup over a vague architecture complaint.
- End after the one issue is opened.

After creating the issue, end your response with exactly one machine-readable line in this format:
${RESULT_MARKER} {"issue_url":"https://github.com/${repo.repo}/issues/123","starting_file":"${startingFile}","summary":"one sentence summary"}
`;
}

async function getSettings(
  ctx: PluginContext,
  payload: Record<string, unknown>,
): Promise<Settings> {
  const enabled = asBoolean(
    payloadValue(payload, "enabled"),
    (await ctx.config.get<boolean>("enabled")) ?? true,
  );
  const repositoryConfigOverride = payloadValue(
    payload,
    "repositoryConfigs",
    "repository_configs",
  );
  const repositories = parseRepositories(
    repositoryConfigOverride ?? await ctx.config.get<unknown>("repositories"),
  ) ?? DEFAULT_REPOSITORIES;
  const harnessName = asString(
    payloadValue(payload, "harnessName", "harness_name"),
    (await ctx.config.get<string>("harness_name")) ?? DEFAULT_HARNESS_NAME,
  );
  const thinking = asString(
    payloadValue(payload, "thinking"),
    (await ctx.config.get<string>("thinking")) ?? DEFAULT_THINKING,
  );
  const provider = asOptionalString(
    payloadValue(payload, "provider") ??
      await ctx.config.get<unknown>("provider"),
  );
  const model = asOptionalString(
    payloadValue(payload, "model") ?? await ctx.config.get<unknown>("model"),
  );
  const tools = asStringArray(
    payloadValue(payload, "tools", "agentTools", "agent_tools") ??
      await ctx.config.get<unknown>("agent_tools"),
    DEFAULT_AGENT_TOOLS,
  );
  const maxReposPerRun = asPositiveInteger(
    payloadValue(payload, "maxReposPerRun", "max_repos_per_run"),
    (await ctx.config.get<number>("max_repos_per_run")) ??
      DEFAULT_MAX_REPOS_PER_RUN,
  );
  const issueLabel = asString(
    payloadValue(payload, "issueLabel", "issue_label"),
    (await ctx.config.get<string>("issue_label")) ?? DEFAULT_ISSUE_LABEL,
  );
  const agentTimeoutMinutes = asPositiveInteger(
    payloadValue(payload, "agentTimeoutMinutes", "agent_timeout_minutes"),
    (await ctx.config.get<number>("agent_timeout_minutes")) ??
      DEFAULT_AGENT_TIMEOUT_MINUTES,
  );
  const maxFileBytes = asPositiveInteger(
    payloadValue(payload, "maxFileBytes", "max_file_bytes"),
    (await ctx.config.get<number>("max_file_bytes")) ?? DEFAULT_MAX_FILE_BYTES,
  );

  return {
    enabled,
    repositories,
    harnessName,
    thinking,
    provider,
    model,
    tools,
    maxReposPerRun,
    issueLabel,
    agentTimeoutMinutes,
    maxFileBytes,
  };
}

function parseRepositories(value: unknown): RepositoryConfig[] | null {
  const parsed = typeof value === "string" ? tryJsonParse(value) : value;
  if (!Array.isArray(parsed)) return null;
  const repos = parsed
    .map(parseRepositoryConfig)
    .filter((repo): repo is RepositoryConfig => repo !== null);
  return repos.length > 0 ? repos : null;
}

function parseRepositoryConfig(value: unknown): RepositoryConfig | null {
  if (!isRecord(value)) return null;
  const name = asOptionalString(value.name) ?? asOptionalString(value.repo);
  const cwd = asOptionalString(value.cwd);
  const repo = asOptionalString(value.repo);
  if (!name || !cwd || !repo) return null;
  return {
    name,
    cwd,
    repo,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    includePaths: parseIncludePaths(value.includePaths ?? value.include_paths),
  };
}

function parseIncludePaths(value: unknown): string[] {
  const parsed = typeof value === "string" ? tryJsonParse(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is string => typeof item === "string")
    .map(normalizeRepoPath)
    .filter((item) => item.length > 0);
}

function normalizeRepoPath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/^\/+/, "").replace(
    /\/+$/,
    "",
  );
}

async function chooseRandomSourceFile(
  cwd: string,
  maxFileBytes: number,
  includePaths: string[],
): Promise<string> {
  const result = await runCommand("git", ["ls-files", "-z"], { cwd });
  const files = result.stdout.split("\0").filter((file) => file.length > 0);
  const candidates: string[] = [];

  for (const file of files) {
    if (!isIncludedPath(file, includePaths)) continue;
    if (shouldExcludeFile(file)) continue;
    try {
      const stat = await Deno.stat(join(cwd, file));
      if (!stat.isFile || stat.size <= 0 || stat.size > maxFileBytes) continue;
      candidates.push(file);
    } catch {
      // Ignore stale git entries or unreadable files.
    }
  }

  if (candidates.length === 0) {
    const includeDescription = includePaths.length > 0
      ? ` within include paths: ${includePaths.join(", ")}`
      : "";
    throw new Error(
      `no source-file candidates found in ${cwd}${includeDescription}`,
    );
  }

  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return candidates[random[0] % candidates.length];
}

function isIncludedPath(path: string, includePaths: string[]): boolean {
  if (includePaths.length === 0) return true;
  const normalized = normalizeRepoPath(path).toLowerCase();
  return includePaths.some((includePath) => {
    const include = normalizeRepoPath(includePath).toLowerCase();
    return normalized === include || normalized.startsWith(`${include}/`);
  });
}

function shouldExcludeFile(path: string): boolean {
  const lower = path.toLowerCase();
  const filename = lower.split(/[\\/]/).pop() ?? lower;
  if (EXCLUDED_FILENAMES.has(filename)) return true;
  if (filename.endsWith(".min.js") || filename.endsWith(".min.css")) {
    return true;
  }
  if (filename.endsWith(".snap")) return true;
  if (lower.startsWith("src-tauri/gen/")) return true;
  if (lower.includes("/generated/") || lower.includes("/vendor/")) return true;
  const parts = lower.split(/[\\/]/);
  for (const part of parts) {
    if (EXCLUDED_DIR_PARTS.has(part)) return true;
  }
  return SOURCE_EXTENSIONS.has(extname(lower));
}

async function ensureGitRepo(cwd: string): Promise<void> {
  const result = await runCommand(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    { cwd },
  );
  if (result.stdout.trim() !== "true") {
    throw new Error(`not a git repository: ${cwd}`);
  }
}

async function gitStatus(cwd: string): Promise<string> {
  return (await runCommand("git", ["status", "--porcelain"], { cwd })).stdout
    .trim();
}

async function verifyIssueUrl(
  repo: RepositoryConfig,
  issueUrl: string,
): Promise<VerifiedIssue> {
  const match = issueUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
  );
  if (!match) throw new Error(`invalid GitHub issue URL: ${issueUrl}`);
  const actualRepo = `${match[1]}/${match[2]}`;
  if (actualRepo.toLowerCase() !== repo.repo.toLowerCase()) {
    throw new Error(
      `issue URL repo ${actualRepo} does not match configured repo ${repo.repo}`,
    );
  }

  const issueNumber = match[3];
  const value = await runJson<unknown>("gh", [
    "issue",
    "view",
    issueNumber,
    "--repo",
    repo.repo,
    "--json",
    "url,title,state",
  ], { cwd: repo.cwd });
  if (!isRecord(value) || typeof value.url !== "string") {
    throw new Error(`gh issue view did not return a URL for ${issueUrl}`);
  }
  return {
    url: value.url,
    title: typeof value.title === "string" ? value.title : undefined,
    state: typeof value.state === "string" ? value.state : undefined,
  };
}

function extractResultMarker(text: string): TechDebtResultMarker | null {
  const lines = text.split(/\r?\n/).reverse();
  for (const line of lines) {
    const markerIndex = line.indexOf(RESULT_MARKER);
    if (markerIndex === -1) continue;
    const jsonText = line.slice(markerIndex + RESULT_MARKER.length).trim();
    const parsed = tryJsonParse(jsonText);
    if (isRecord(parsed)) return parsed as TechDebtResultMarker;
  }
  return null;
}

function markerIssueUrl(marker: TechDebtResultMarker | null): string | null {
  return typeof marker?.issue_url === "string" &&
      marker.issue_url.trim().length > 0
    ? marker.issue_url.trim()
    : null;
}

function markerStartingFile(
  marker: TechDebtResultMarker | null,
): string | null {
  return typeof marker?.starting_file === "string" &&
      marker.starting_file.trim().length > 0
    ? marker.starting_file.trim()
    : null;
}

function markerSummary(
  marker: TechDebtResultMarker | null,
): string | undefined {
  return typeof marker?.summary === "string" && marker.summary.trim().length > 0
    ? marker.summary.trim()
    : undefined;
}

function extractIssueUrl(text: string): string | null {
  const match = text.match(/https:\/\/github\.com\/[^\s)]+\/issues\/\d+/);
  return match?.[0] ?? null;
}

function weeklyStateKey(repo: RepositoryConfig, week: string): string {
  return `tech-debt-analysis:${repo.name}:${week}`;
}

function isoWeekString(date = new Date()): string {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    (((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function getRepoFilter(payload: Record<string, unknown>): Set<string> | null {
  const repos = payloadValue(payload, "repos", "repositories");
  if (!Array.isArray(repos)) return null;
  const values = repos.filter((repo): repo is string =>
    typeof repo === "string" && repo.length > 0
  );
  return values.length > 0 ? new Set(values) : null;
}

function eventPayload(event: PluginEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function payloadValue(
  payload: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  const parsed = typeof value === "string" ? tryJsonParse(value) : value;
  if (!Array.isArray(parsed)) return fallback;
  const strings = parsed
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return strings.length > 0 ? strings : fallback;
}

async function runJson<T>(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<T> {
  const result = await runCommand(command, args, options);
  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(
      `failed to parse JSON from ${command} ${args.join(" ")}: ${
        stringifyError(error)
      }\n${result.stdout}`,
    );
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<CommandResult> {
  const output = await new Deno.Command(command, {
    args,
    cwd: options.cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();

  const result: CommandResult = {
    command,
    args,
    cwd: options.cwd,
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };

  if (!output.success) throw new CommandError(result);
  return result;
}

function tryJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tail(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : text.slice(text.length - maxLength);
}
