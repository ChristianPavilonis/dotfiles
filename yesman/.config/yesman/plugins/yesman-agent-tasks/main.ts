import {
  definePlugin,
  type HarnessRunStatus,
  type PluginContext,
  type PluginEvent,
} from "@yesman/sdk";
import { basename, extname, join, relative } from "node:path";

const DEFAULT_VAULT_PATH = "/home/christian/Documents/MyObsidianVault";
const DEFAULT_WORKTREE_ROOT = "/home/christian/worktrees";
const DEFAULT_MARKER = "@yesman";
const DEFAULT_STATUSES = ["open"];
const DEFAULT_MAX_NEW_PER_SCAN = 1;
const DEFAULT_MAX_CONCURRENCY = 1;
const DEFAULT_AGENT_TIMEOUT_MINUTES = 90;
const DEFAULT_BRANCH_PREFIX = "yesman";
const DEFAULT_AGENT_TOOLS = [
  "read",
  "write",
  "edit",
  "bash",
  "ffgrep",
  "fffind",
];
const DEFAULT_AGENT_THINKING = "off";
const MANAGED_START = "<!-- yesman-agent:start -->";
const MANAGED_END = "<!-- yesman-agent:end -->";

const DEFAULT_PROJECT_REPOS: Record<string, string> = {
  rigzilla: "/home/christian/projects/rigzilla",
  scrapezilla: "/home/christian/projects/scrapezilla",
  "trusted-server": "/home/christian/projects/trusted-server",
  yesman: "/home/christian/projects/yesman",
};

const DEFAULT_SKIP_PROJECTS: string[] = [];

const ACTIVE_STATES = new Set([
  "claimed",
  "note_activated",
  "worktree_created",
  "agent_started",
]);

const TERMINAL_STATES = new Set([
  "agent_completed",
  "pr_opened",
  "failed",
  "cancelled",
  "interrupted",
]);

type Config = {
  enabled: boolean;
  dryRun: boolean;
  vaultPath: string;
  worktreeRoot: string;
  marker: string;
  statuses: string[];
  maxNewPerScan: number;
  maxConcurrency: number;
  agentTimeoutMinutes: number;
  draftPr: boolean;
  branchPrefix: string;
  updateNotes: boolean;
  projectRepos: Record<string, string>;
  skipProjects: string[];
  agentTools: string[];
  agentThinking: string;
};

type Frontmatter = Record<string, string>;

type ParsedNote = {
  path: string;
  relativePath: string;
  title: string;
  content: string;
  frontmatter: Frontmatter;
  body: string;
  frontmatterPrefix: string;
};

type Directive = {
  line: string;
  instruction: string;
  lineIndex: number;
};

type Candidate = {
  taskId: string;
  contentHash: string;
  shortHash: string;
  notePath: string;
  relativePath: string;
  noteTitle: string;
  noteSlug: string;
  project: string;
  repoPath?: string;
  branch?: string;
  worktreePath?: string;
  directiveLine: string;
  directive: string;
  noteContent: string;
};

type TaskStatus =
  | "discovered"
  | "claimed"
  | "note_activated"
  | "worktree_created"
  | "agent_started"
  | "agent_completed"
  | "pr_opened"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "reset";

type TaskState = {
  taskId: string;
  contentHash: string;
  notePath: string;
  relativePath: string;
  noteTitle: string;
  project: string;
  repoPath?: string;
  baseRef?: string;
  branch?: string;
  worktreePath?: string;
  directiveLine: string;
  directive: string;
  runId?: string;
  status: TaskStatus;
  noteStatus?: string;
  prUrl?: string | null;
  summary?: string;
  startedAt: string;
  updatedAt: string;
  attempts: number;
  lastError?: string | null;
};

type ActiveRun = {
  taskId: string;
  runId: string;
  startedAt: string;
};

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type AgentFinalJson = {
  summary?: unknown;
  branch?: unknown;
  commit?: unknown;
  prUrl?: unknown;
  noteEdited?: unknown;
  tests?: unknown;
  notes?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : fallback;
}

function asStringRecord(
  value: unknown,
  fallback: Record<string, string>,
): Record<string, string> {
  if (!isRecord(value)) return fallback;
  const result: Record<string, string> = { ...fallback };
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim().length > 0) {
      result[key] = item.trim();
    }
  }
  return result;
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

async function loadConfig(
  ctx: PluginContext,
  payload: Record<string, unknown> = {},
): Promise<Config> {
  const configuredRepos = await ctx.config.get<Record<string, string>>(
    "project_repos",
  );
  return {
    enabled: asBoolean(
      payloadValue(payload, "enabled"),
      (await ctx.config.get<boolean>("enabled")) ?? true,
    ),
    dryRun: asBoolean(
      payloadValue(payload, "dryRun", "dry_run"),
      (await ctx.config.get<boolean>("dry_run")) ?? false,
    ),
    vaultPath: asString(
      payloadValue(payload, "vaultPath", "vault_path"),
      (await ctx.config.get<string>("vault_path")) ?? DEFAULT_VAULT_PATH,
    ),
    worktreeRoot: asString(
      payloadValue(payload, "worktreeRoot", "worktree_root"),
      (await ctx.config.get<string>("worktree_root")) ?? DEFAULT_WORKTREE_ROOT,
    ),
    marker: asString(
      payloadValue(payload, "marker"),
      (await ctx.config.get<string>("marker")) ?? DEFAULT_MARKER,
    ),
    statuses: asStringArray(
      payloadValue(payload, "statuses"),
      (await ctx.config.get<string[]>("statuses")) ?? DEFAULT_STATUSES,
    ),
    maxNewPerScan: asPositiveInteger(
      payloadValue(payload, "maxNewPerScan", "max_new_per_scan"),
      (await ctx.config.get<number>("max_new_per_scan")) ??
        DEFAULT_MAX_NEW_PER_SCAN,
    ),
    maxConcurrency: asPositiveInteger(
      payloadValue(payload, "maxConcurrency", "max_concurrency"),
      (await ctx.config.get<number>("max_concurrency")) ??
        DEFAULT_MAX_CONCURRENCY,
    ),
    agentTimeoutMinutes: asPositiveInteger(
      payloadValue(payload, "agentTimeoutMinutes", "agent_timeout_minutes"),
      (await ctx.config.get<number>("agent_timeout_minutes")) ??
        DEFAULT_AGENT_TIMEOUT_MINUTES,
    ),
    draftPr: asBoolean(
      payloadValue(payload, "draftPr", "draft_pr"),
      (await ctx.config.get<boolean>("draft_pr")) ?? true,
    ),
    branchPrefix: asString(
      payloadValue(payload, "branchPrefix", "branch_prefix"),
      (await ctx.config.get<string>("branch_prefix")) ?? DEFAULT_BRANCH_PREFIX,
    ),
    updateNotes: asBoolean(
      payloadValue(payload, "updateNotes", "update_notes"),
      (await ctx.config.get<boolean>("update_notes")) ?? true,
    ),
    projectRepos: asStringRecord(
      payloadValue(payload, "projectRepos", "project_repos"),
      asStringRecord(configuredRepos, DEFAULT_PROJECT_REPOS),
    ),
    skipProjects: asStringArray(
      payloadValue(payload, "skipProjects", "skip_projects"),
      (await ctx.config.get<string[]>("skip_projects")) ??
        DEFAULT_SKIP_PROJECTS,
    ),
    agentTools: asStringArray(
      payloadValue(payload, "agentTools", "agent_tools"),
      (await ctx.config.get<string[]>("agent_tools")) ?? DEFAULT_AGENT_TOOLS,
    ),
    agentThinking: asString(
      payloadValue(payload, "agentThinking", "agent_thinking"),
      (await ctx.config.get<string>("agent_thinking")) ??
        DEFAULT_AGENT_THINKING,
    ),
  };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function sanitizeSlug(input: string, maxLength = 48): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "task";
}

function parseFrontmatter(raw: string): Frontmatter {
  const frontmatter: Frontmatter = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([^:#][^:]*):\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return frontmatter;
}

function splitFrontmatter(
  content: string,
): { raw: string; body: string; prefix: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  return {
    raw: match[1],
    body: content.slice(match[0].length),
    prefix: match[0],
  };
}

function parseNoteContent(
  notePath: string,
  vaultPath: string,
  content: string,
): ParsedNote | null {
  const split = splitFrontmatter(content);
  if (!split) return null;
  const fileName = basename(notePath);
  const extension = extname(fileName);
  return {
    path: notePath,
    relativePath: relative(vaultPath, notePath),
    title: extension.length > 0
      ? fileName.slice(0, -extension.length)
      : fileName,
    content,
    frontmatter: parseFrontmatter(split.raw),
    body: split.body,
    frontmatterPrefix: split.prefix,
  };
}

function findDirective(body: string, marker: string): Directive | null {
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const markerIndex = lines[index].indexOf(marker);
    if (markerIndex === -1) continue;
    const line = lines[index].trim();
    const instruction =
      lines[index].slice(markerIndex + marker.length).trim() || line;
    return { line, instruction, lineIndex: index };
  }
  return null;
}

function removeDirectiveLine(
  body: string,
  marker: string,
  lineIndex: number,
): string {
  const lines = body.split(/\r?\n/);
  const nextLines = lines.filter((_, index) => index !== lineIndex).map((
    line,
  ) => line.replaceAll(marker, "YesMan"));
  return nextLines.join("\n").replace(/^\n{3,}/, "\n\n");
}

function shouldSkipPath(path: string, vaultPath: string): boolean {
  const parts = relative(vaultPath, path).split(/[\\/]+/).map((part) =>
    part.toLowerCase()
  );
  return parts.some((part) =>
    part === ".obsidian" ||
    part === "templates" ||
    part === "daily" ||
    part === "archive" ||
    part === "archives" ||
    part === "archived"
  );
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name);
      if (entry.isDirectory) {
        if (!shouldSkipPath(path, root)) await walk(path);
      } else if (
        entry.isFile && entry.name.endsWith(".md") &&
        !shouldSkipPath(path, root)
      ) {
        results.push(path);
      }
    }
  }
  await walk(root);
  return results.sort();
}

function stripManagedBlock(text: string): string {
  const start = text.indexOf(MANAGED_START);
  const end = text.indexOf(MANAGED_END);
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(0, start) + text.slice(end + MANAGED_END.length);
}

async function taskIdForNotePath(
  vaultPath: string,
  notePath: string,
): Promise<string> {
  return (await sha256Hex(relative(vaultPath, notePath))).slice(0, 16);
}

async function buildCandidate(
  config: Config,
  notePath: string,
): Promise<{ candidate?: Candidate; skipReason?: string }> {
  let content: string;
  try {
    content = await Deno.readTextFile(notePath);
  } catch (error) {
    return { skipReason: "failed to read note: " + errorMessage(error) };
  }

  const parsed = parseNoteContent(notePath, config.vaultPath, content);
  if (!parsed) return { skipReason: "missing frontmatter" };

  const type = parsed.frontmatter.type?.trim();
  const status = parsed.frontmatter.status?.trim();
  const project = parsed.frontmatter.project?.trim();

  if (type !== "task") return { skipReason: "not a task note" };
  if (!status || !config.statuses.includes(status)) {
    return { skipReason: "status is " + (status || "missing") };
  }
  if (!project) return { skipReason: "missing project" };
  if (config.skipProjects.includes(project)) {
    return { skipReason: "project " + project + " is skipped" };
  }

  const directive = findDirective(parsed.body, config.marker);
  if (!directive) return { skipReason: "missing " + config.marker };

  const taskId = await taskIdForNotePath(config.vaultPath, notePath);
  const contentHash = await sha256Hex([
    parsed.relativePath,
    project,
    type,
    status,
    directive.line,
    stripManagedBlock(parsed.body).trim(),
  ].join("\n---\n"));
  const shortHash = contentHash.slice(0, 8);
  const noteSlug = sanitizeSlug(parsed.title);
  const safeProject = sanitizeSlug(project, 32);
  const repoPath = config.projectRepos[project];
  const branch = repoPath
    ? `${config.branchPrefix}/${safeProject}/${noteSlug}-${shortHash}`
    : undefined;
  const worktreePath = repoPath
    ? join(
      config.worktreeRoot,
      `${config.branchPrefix}-${safeProject}-${noteSlug}-${shortHash}`,
    )
    : undefined;

  return {
    candidate: {
      taskId,
      contentHash,
      shortHash,
      notePath,
      relativePath: parsed.relativePath,
      noteTitle: parsed.title,
      noteSlug,
      project,
      repoPath,
      branch,
      worktreePath,
      directiveLine: directive.line,
      directive: directive.instruction,
      noteContent: parsed.content,
    },
  };
}

async function discoverCandidates(config: Config): Promise<Candidate[]> {
  const notePaths = await walkMarkdownFiles(config.vaultPath);
  const candidates: Candidate[] = [];
  for (const notePath of notePaths) {
    const { candidate } = await buildCandidate(config, notePath);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath)
  );
}

function taskKey(taskId: string): string {
  return `task:${taskId}`;
}

async function getTaskState(
  ctx: PluginContext,
  taskId: string,
): Promise<TaskState | null> {
  return await ctx.kv.get<TaskState>(taskKey(taskId));
}

async function getTaskIndex(ctx: PluginContext): Promise<string[]> {
  const value = await ctx.kv.get<unknown>("tasks:index");
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function addTaskToIndex(
  ctx: PluginContext,
  taskId: string,
): Promise<void> {
  const index = await getTaskIndex(ctx);
  if (!index.includes(taskId)) {
    index.push(taskId);
    await ctx.kv.set("tasks:index", index);
  }
}

async function setTaskState(
  ctx: PluginContext,
  state: TaskState,
): Promise<void> {
  await ctx.kv.set(taskKey(state.taskId), state);
  await addTaskToIndex(ctx, state.taskId);
}

async function getActiveRuns(ctx: PluginContext): Promise<ActiveRun[]> {
  const value = await ctx.kv.get<unknown>("active:runs");
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ActiveRun =>
    isRecord(item) &&
    typeof item.taskId === "string" &&
    typeof item.runId === "string" &&
    typeof item.startedAt === "string"
  );
}

async function setActiveRuns(
  ctx: PluginContext,
  runs: ActiveRun[],
): Promise<void> {
  await ctx.kv.set("active:runs", runs);
}

async function addActiveRun(ctx: PluginContext, run: ActiveRun): Promise<void> {
  const runs = await getActiveRuns(ctx);
  const next = runs.filter((item) =>
    item.taskId !== run.taskId && item.runId !== run.runId
  );
  next.push(run);
  await setActiveRuns(ctx, next);
}

async function removeActiveRun(
  ctx: PluginContext,
  taskId: string,
  runId?: string,
): Promise<void> {
  const runs = await getActiveRuns(ctx);
  await setActiveRuns(
    ctx,
    runs.filter((item) =>
      item.taskId !== taskId && (!runId || item.runId !== runId)
    ),
  );
}

async function currentActiveTaskCount(ctx: PluginContext): Promise<number> {
  const runs = await getActiveRuns(ctx);
  let count = 0;
  for (const run of runs) {
    const state = await getTaskState(ctx, run.taskId);
    if (!state || ACTIVE_STATES.has(state.status)) count++;
  }
  return count;
}

async function runGit(cwd: string, args: string[]): Promise<CommandResult> {
  const output = await new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout).trim(),
    stderr: decoder.decode(output.stderr).trim(),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function ensureGitRepo(path: string): Promise<void> {
  const result = await runGit(path, ["rev-parse", "--is-inside-work-tree"]);
  if (result.code !== 0 || result.stdout !== "true") {
    throw new Error("not a git repository: " + path);
  }
}

async function hasRef(repoPath: string, ref: string): Promise<boolean> {
  const result = await runGit(repoPath, [
    "show-ref",
    "--verify",
    "--quiet",
    ref,
  ]);
  return result.code === 0;
}

async function resolveBaseRef(repoPath: string): Promise<string> {
  const symbolic = await runGit(repoPath, [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
  ]);
  if (symbolic.code === 0 && symbolic.stdout.startsWith("refs/remotes/")) {
    return symbolic.stdout.replace("refs/remotes/", "");
  }
  if (await hasRef(repoPath, "refs/remotes/origin/main")) return "origin/main";
  if (await hasRef(repoPath, "refs/remotes/origin/master")) {
    return "origin/master";
  }
  throw new Error("could not resolve origin default branch");
}

async function createWorktree(candidate: Candidate): Promise<string> {
  if (!candidate.repoPath || !candidate.branch || !candidate.worktreePath) {
    throw new Error("candidate has no configured repo/worktree");
  }

  await ensureGitRepo(candidate.repoPath);
  const remote = await runGit(candidate.repoPath, [
    "remote",
    "get-url",
    "origin",
  ]);
  if (remote.code !== 0) throw new Error("repo has no origin remote");

  const fetch = await runGit(candidate.repoPath, [
    "fetch",
    "--prune",
    "origin",
  ]);
  if (fetch.code !== 0) {
    throw new Error(fetch.stderr || fetch.stdout || "git fetch failed");
  }

  const baseRef = await resolveBaseRef(candidate.repoPath);
  if (await hasRef(candidate.repoPath, `refs/heads/${candidate.branch}`)) {
    throw new Error("local branch already exists: " + candidate.branch);
  }
  if (
    await hasRef(candidate.repoPath, `refs/remotes/origin/${candidate.branch}`)
  ) {
    throw new Error("remote branch already exists: origin/" + candidate.branch);
  }
  if (await pathExists(candidate.worktreePath)) {
    throw new Error("worktree path already exists: " + candidate.worktreePath);
  }

  const worktree = await runGit(candidate.repoPath, [
    "worktree",
    "add",
    "-b",
    candidate.branch,
    candidate.worktreePath,
    baseRef,
  ]);
  if (worktree.code !== 0) {
    throw new Error(
      worktree.stderr || worktree.stdout || "git worktree add failed",
    );
  }
  return baseRef;
}

function setFrontmatterStatus(content: string, status: string): string {
  const split = splitFrontmatter(content);
  if (!split) throw new Error("note is missing frontmatter");
  const lines = split.raw.split(/\r?\n/);
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (/^status\s*:/.test(line)) {
      replaced = true;
      return `status: ${status}`;
    }
    return line;
  });
  if (!replaced) nextLines.push(`status: ${status}`);
  return `---\n${nextLines.join("\n")}\n---\n${split.body}`;
}

function upsertManagedBlock(content: string, lines: string[]): string {
  const split = splitFrontmatter(content);
  if (!split) throw new Error("note is missing frontmatter");
  const block = `${MANAGED_START}\n${lines.join("\n")}\n${MANAGED_END}`;
  const body = split.body;
  const start = body.indexOf(MANAGED_START);
  const end = body.indexOf(MANAGED_END);
  const nextBody = start !== -1 && end !== -1 && end > start
    ? body.slice(0, start) + block + body.slice(end + MANAGED_END.length)
    : `${block}\n\n${body.replace(/^\n+/, "")}`;
  return `${split.prefix}${nextBody}`;
}

function removeManagedBlockFromContent(content: string): string {
  const split = splitFrontmatter(content);
  if (!split) throw new Error("note is missing frontmatter");
  const start = split.body.indexOf(MANAGED_START);
  const end = split.body.indexOf(MANAGED_END);
  if (start === -1 || end === -1 || end < start) return content;
  const nextBody =
    (split.body.slice(0, start) + split.body.slice(end + MANAGED_END.length))
      .replace(/^\n{3,}/, "\n\n");
  return `${split.prefix}${nextBody}`;
}

function compactLine(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function managedBlockLines(
  state: TaskState,
  blockStatus: string,
  extras: Record<string, unknown> = {},
): string[] {
  const lines = [
    `Status: ${blockStatus}`,
    `Task ID: ${state.taskId}`,
    `Directive: ${compactLine(state.directive)}`,
  ];
  if (state.branch) lines.push(`Branch: ${state.branch}`);
  if (state.worktreePath) lines.push(`Worktree: ${state.worktreePath}`);
  lines.push(`Run: ${state.runId ?? "pending"}`);
  if (state.prUrl || extras.prUrl) {
    lines.push(`PR: ${compactLine(extras.prUrl ?? state.prUrl)}`);
  }
  if (state.startedAt) lines.push(`Picked up: ${state.startedAt}`);
  lines.push(`Last update: ${new Date().toISOString()}`);
  if (extras.summary) lines.push(`Summary: ${compactLine(extras.summary)}`);
  if (extras.error) lines.push(`Error: ${compactLine(extras.error)}`);
  if (
    TERMINAL_STATES.has(blockStatus) && blockStatus !== "agent_completed" &&
    blockStatus !== "pr_opened"
  ) {
    lines.push(
      "Reset: change frontmatter status back to open or emit yesman-agent-tasks.reset after inspection.",
    );
  }
  return lines;
}

async function writeNoteIfUnchanged(
  path: string,
  expectedContent: string,
  nextContent: string,
): Promise<void> {
  const current = await Deno.readTextFile(path);
  if (current !== expectedContent) {
    throw new Error("note changed while preparing update; aborting exact edit");
  }
  if (current !== nextContent) await Deno.writeTextFile(path, nextContent);
}

async function activateNote(
  config: Config,
  candidate: Candidate,
  state: TaskState,
): Promise<void> {
  if (!config.updateNotes) return;
  const content = await Deno.readTextFile(candidate.notePath);
  const parsed = parseNoteContent(
    candidate.notePath,
    config.vaultPath,
    content,
  );
  if (!parsed) throw new Error("note no longer has frontmatter");
  if (parsed.frontmatter.type !== "task") {
    throw new Error("note is no longer type: task");
  }
  if (parsed.frontmatter.status !== "open") {
    throw new Error(
      "note status changed to " + (parsed.frontmatter.status || "missing"),
    );
  }
  const directive = findDirective(parsed.body, config.marker);
  if (!directive) throw new Error("note no longer contains " + config.marker);

  let nextContent = setFrontmatterStatus(content, "active");
  const split = splitFrontmatter(nextContent);
  if (!split) {
    throw new Error("note no longer has frontmatter after status update");
  }
  nextContent = `${split.prefix}${
    removeDirectiveLine(split.body, config.marker, directive.lineIndex)
  }`;
  nextContent = upsertManagedBlock(
    nextContent,
    managedBlockLines(state, "active"),
  );
  await writeNoteIfUnchanged(candidate.notePath, content, nextContent);
}

async function updateNoteState(
  config: Config,
  state: TaskState,
  noteStatus: string | null,
  blockStatus: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  if (!config.updateNotes) return;
  const current = await Deno.readTextFile(state.notePath);
  let nextContent = current;
  if (noteStatus) nextContent = setFrontmatterStatus(nextContent, noteStatus);
  nextContent = upsertManagedBlock(
    nextContent,
    managedBlockLines(state, blockStatus, extras),
  );
  await writeNoteIfUnchanged(state.notePath, current, nextContent);
}

async function tryUpdateNoteState(
  ctx: PluginContext,
  config: Config,
  state: TaskState,
  noteStatus: string | null,
  blockStatus: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  try {
    await updateNoteState(config, state, noteStatus, blockStatus, extras);
  } catch (error) {
    await ctx.log("failed to update yesman agent task note", {
      taskId: state.taskId,
      notePath: state.notePath,
      blockStatus,
      error: errorMessage(error),
    });
  }
}

async function resetNote(config: Config, state: TaskState): Promise<void> {
  if (!config.updateNotes) return;
  const current = await Deno.readTextFile(state.notePath);
  let nextContent = setFrontmatterStatus(current, "open");
  nextContent = removeManagedBlockFromContent(nextContent);
  await writeNoteIfUnchanged(state.notePath, current, nextContent);
}

function buildAgentPrompt(
  candidate: Candidate,
  state: TaskState,
  config: Config,
): string {
  const repoContext =
    candidate.repoPath && candidate.worktreePath && candidate.branch
      ? [
        "A repository is configured for this note.",
        `Repository: ${candidate.repoPath}`,
        `Worktree: ${candidate.worktreePath}`,
        `Branch: ${candidate.branch}`,
        `Base ref: ${state.baseRef ?? "unknown"}`,
        "If the directive requires code changes, work in this worktree, commit focused changes, push the branch, and open a draft GitHub PR with gh pr create --draft.",
      ].join("\n")
      : [
        "No repository is configured for this note/project.",
        "Do not attempt code changes. You may research, plan, and edit the Obsidian note directly.",
      ].join("\n");

  return [
    "You are a coding/research agent working for Christian via YesMan automation.",
    "",
    `Directive from the note: ${candidate.directive}`,
    `Original directive line: ${candidate.directiveLine}`,
    `Task note path: ${candidate.notePath}`,
    `Project: ${candidate.project}`,
    repoContext,
    "",
    "The YesMan plugin has already removed the @yesman directive from the visible note and set the note status to active.",
    "You may edit the task note directly when useful. Choose whatever section headings make sense for your findings or updates.",
    "Do not edit the yesman-agent managed metadata block between the HTML comments.",
    "Use the whole note as context, but follow the directive line as the primary instruction.",
    "Decide what needs to be done: research, note updates, planning, code work, a PR, or some combination.",
    "If you make code changes, run appropriate formatting/tests when practical, commit, push, and open a draft PR. Do not merge PRs.",
    "If you only update the note, no commit or PR is required.",
    "Finish with a final JSON object only, matching this shape:",
    "{",
    '  "summary": "short summary",',
    `  \"branch\": ${candidate.branch ? `\"${candidate.branch}\"` : '""'},`,
    '  "commit": "HEAD commit sha if code was committed",',
    '  "prUrl": "https://github.com/owner/repo/pull/123 if opened",',
    '  "noteEdited": true,',
    '  "tests": ["commands run"],',
    '  "notes": ["anything important"]',
    "}",
    "",
    "--- TASK NOTE CONTENT AT PICKUP START ---",
    candidate.noteContent,
    "--- TASK NOTE CONTENT AT PICKUP END ---",
  ].join("\n");
}

async function startAgentRun(
  ctx: PluginContext,
  config: Config,
  candidate: Candidate,
  state: TaskState,
): Promise<TaskState> {
  const cwd = candidate.worktreePath ?? config.vaultPath;
  const run = await ctx.harness.start("pi", {
    prompt: buildAgentPrompt(candidate, state, config),
    cwd,
    thinking: config.agentThinking,
    tools: config.agentTools,
  });
  const nextState: TaskState = {
    ...state,
    runId: run.runId,
    status: "agent_started",
    updatedAt: new Date().toISOString(),
  };
  await setTaskState(ctx, nextState);
  await addActiveRun(ctx, {
    taskId: nextState.taskId,
    runId: run.runId,
    startedAt: nextState.updatedAt,
  });
  await tryUpdateNoteState(ctx, config, nextState, "active", "active");
  await ctx.emit({
    type: "yesman-agent-tasks.agent.started",
    payload: lifecyclePayload(nextState),
  });
  return nextState;
}

async function handleCandidate(
  ctx: PluginContext,
  config: Config,
  candidate: Candidate,
  dryRun: boolean,
): Promise<{ status: string; reason?: string; taskId: string }> {
  const existing = await getTaskState(ctx, candidate.taskId);
  if (existing && existing.status !== "reset") {
    return {
      status: "skipped",
      reason: "existing state " + existing.status +
        "; reset required before rerun",
      taskId: candidate.taskId,
    };
  }

  if (candidate.repoPath) {
    await ensureGitRepo(candidate.repoPath);
    if (!candidate.branch || !candidate.worktreePath) {
      throw new Error("repo candidate missing branch/worktree");
    }
    if (await pathExists(candidate.worktreePath)) {
      return {
        status: "skipped",
        reason: "worktree path already exists",
        taskId: candidate.taskId,
      };
    }
    if (await hasRef(candidate.repoPath, `refs/heads/${candidate.branch}`)) {
      return {
        status: "skipped",
        reason: "branch already exists",
        taskId: candidate.taskId,
      };
    }
  }

  if (dryRun) return { status: "dry_run", taskId: candidate.taskId };

  const now = new Date().toISOString();
  let state: TaskState = {
    taskId: candidate.taskId,
    contentHash: candidate.contentHash,
    notePath: candidate.notePath,
    relativePath: candidate.relativePath,
    noteTitle: candidate.noteTitle,
    project: candidate.project,
    repoPath: candidate.repoPath,
    branch: candidate.branch,
    worktreePath: candidate.worktreePath,
    directiveLine: candidate.directiveLine,
    directive: candidate.directive,
    status: "claimed",
    noteStatus: "open",
    prUrl: null,
    startedAt: now,
    updatedAt: now,
    attempts: existing ? existing.attempts + 1 : 1,
    lastError: null,
  };

  await setTaskState(ctx, state);
  await ctx.emit({
    type: "yesman-agent-tasks.task.claimed",
    payload: lifecyclePayload(state),
  });

  try {
    await activateNote(config, candidate, state);
    state = {
      ...state,
      status: "note_activated",
      noteStatus: "active",
      updatedAt: new Date().toISOString(),
    };
    await setTaskState(ctx, state);
    await ctx.emit({
      type: "yesman-agent-tasks.note.activated",
      payload: lifecyclePayload(state),
    });
  } catch (error) {
    state = await failBeforeAgent(
      ctx,
      config,
      state,
      error,
      "note activation failed",
    );
    return {
      status: "failed",
      reason: state.lastError ?? undefined,
      taskId: candidate.taskId,
    };
  }

  if (candidate.repoPath) {
    try {
      const baseRef = await createWorktree(candidate);
      state = {
        ...state,
        baseRef,
        status: "worktree_created",
        updatedAt: new Date().toISOString(),
      };
      await setTaskState(ctx, state);
      await tryUpdateNoteState(ctx, config, state, "active", "active");
      await ctx.emit({
        type: "yesman-agent-tasks.worktree.created",
        payload: lifecyclePayload(state),
      });
    } catch (error) {
      state = await failBeforeAgent(
        ctx,
        config,
        state,
        error,
        "worktree creation failed",
      );
      return {
        status: "failed",
        reason: state.lastError ?? undefined,
        taskId: candidate.taskId,
      };
    }
  }

  try {
    await startAgentRun(ctx, config, candidate, state);
    return { status: "started", taskId: candidate.taskId };
  } catch (error) {
    state = await failBeforeAgent(
      ctx,
      config,
      state,
      error,
      "agent start failed",
    );
    return {
      status: "failed",
      reason: state.lastError ?? undefined,
      taskId: candidate.taskId,
    };
  }
}

async function failBeforeAgent(
  ctx: PluginContext,
  config: Config,
  state: TaskState,
  error: unknown,
  context: string,
): Promise<TaskState> {
  const message = context + ": " + errorMessage(error);
  const nextState: TaskState = {
    ...state,
    status: "failed",
    noteStatus: "blocked",
    lastError: message,
    updatedAt: new Date().toISOString(),
  };
  await setTaskState(ctx, nextState);
  await tryUpdateNoteState(ctx, config, nextState, "blocked", "failed", {
    error: message,
  });
  await ctx.emit({
    type: "yesman-agent-tasks.task.failed",
    payload: { ...lifecyclePayload(nextState), error: message },
  });
  return nextState;
}

async function handleScan(
  ctx: PluginContext,
  event: PluginEvent,
): Promise<void> {
  const payload = eventPayload(event);
  const config = await loadConfig(ctx, payload);
  const dryRun = asBoolean(
    payloadValue(payload, "dryRun", "dry_run"),
    config.dryRun,
  );
  const force = asBoolean(payloadValue(payload, "force"), false);

  await ctx.emit({
    type: "yesman-agent-tasks.scan.started",
    payload: { dryRun, vaultPath: config.vaultPath, marker: config.marker },
  });

  if (!config.enabled && !force) {
    await ctx.log("yesman agent task scan skipped; plugin disabled", {
      dryRun,
    });
    await ctx.emit({
      type: "yesman-agent-tasks.scan.completed",
      payload: { skipped: true, reason: "disabled" },
    });
    return;
  }

  const activeCount = await currentActiveTaskCount(ctx);
  if (!dryRun && activeCount >= config.maxConcurrency) {
    await ctx.log("yesman agent task scan skipped; concurrency limit reached", {
      activeCount,
      maxConcurrency: config.maxConcurrency,
    });
    await ctx.emit({
      type: "yesman-agent-tasks.scan.completed",
      payload: { skipped: true, reason: "concurrency limit", activeCount },
    });
    return;
  }

  const notePath = asString(payloadValue(payload, "notePath", "note_path"), "");
  let candidates = notePath
    ? [(await buildCandidate(config, notePath)).candidate].filter((
      item,
    ): item is Candidate => Boolean(item))
    : await discoverCandidates(config);
  candidates = candidates.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath)
  );

  const remainingSlots = dryRun
    ? config.maxNewPerScan
    : Math.max(0, config.maxConcurrency - activeCount);
  const limit = Math.min(config.maxNewPerScan, remainingSlots);
  const results: Array<
    {
      status: string;
      reason?: string;
      taskId: string;
      notePath?: string;
      directive?: string;
      hasRepo?: boolean;
    }
  > = [];
  let started = 0;

  for (const candidate of candidates) {
    if (!dryRun && started >= limit) break;
    const result = await handleCandidate(ctx, config, candidate, dryRun);
    results.push({
      ...result,
      notePath: candidate.notePath,
      directive: candidate.directive,
      hasRepo: Boolean(candidate.repoPath),
    });
    if (result.status === "started" || result.status === "dry_run") started++;
  }

  const summary = {
    dryRun,
    candidateCount: candidates.length,
    processed: results.length,
    started: results.filter((item) => item.status === "started").length,
    dryRunMatches: results.filter((item) => item.status === "dry_run").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
  await ctx.log("yesman agent task scan completed", summary);
  await ctx.emit({
    type: "yesman-agent-tasks.scan.completed",
    payload: summary,
  });
}

async function handleRunOne(
  ctx: PluginContext,
  event: PluginEvent,
): Promise<void> {
  const payload = eventPayload(event);
  const notePath = asString(payloadValue(payload, "notePath", "note_path"), "");
  if (!notePath) throw new Error("notePath is required");
  await handleScan(ctx, {
    ...event,
    payload: {
      ...payload,
      notePath,
      force: true,
      dryRun: payloadValue(payload, "dryRun", "dry_run") ?? false,
    },
  });
}

function lifecyclePayload(state: TaskState): Record<string, unknown> {
  return {
    taskId: state.taskId,
    notePath: state.notePath,
    project: state.project,
    repoPath: state.repoPath,
    baseRef: state.baseRef,
    branch: state.branch,
    worktreePath: state.worktreePath,
    directive: state.directive,
    directiveLine: state.directiveLine,
    runId: state.runId,
    prUrl: state.prUrl,
    status: state.status,
    error: state.lastError,
    summary: state.summary,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function minutesSince(iso: string): number {
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return 0;
  return (Date.now() - start) / 60_000;
}

function extractPrUrl(text: string): string | null {
  const match = text.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/);
  return match?.[0] ?? null;
}

function extractFinalJson(text: string): AgentFinalJson | null {
  const fenceRegex = new RegExp("```(?:json)?\\s*([\\s\\S]*?)```", "g");
  const fenceMatches = [...text.matchAll(fenceRegex)];
  for (const match of fenceMatches.reverse()) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (isRecord(parsed)) return parsed as AgentFinalJson;
    } catch {
      // Try the next candidate.
    }
  }

  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (isRecord(parsed)) return parsed as AgentFinalJson;
    } catch {
      // Ignore malformed trailing JSON.
    }
  }
  return null;
}

async function inspectWorktreeOutcome(
  state: TaskState,
): Promise<
  { ok: boolean; commitCount: number; dirty: boolean; error?: string }
> {
  if (!state.worktreePath || !state.baseRef) {
    return { ok: true, commitCount: 0, dirty: false };
  }
  if (!(await pathExists(state.worktreePath))) {
    return {
      ok: false,
      commitCount: 0,
      dirty: false,
      error: "worktree path is missing",
    };
  }

  const dirty = await runGit(state.worktreePath, ["status", "--porcelain"]);
  if (dirty.code !== 0) {
    return {
      ok: false,
      commitCount: 0,
      dirty: false,
      error: dirty.stderr || dirty.stdout,
    };
  }

  const commits = await runGit(state.worktreePath, [
    "rev-list",
    "--count",
    state.baseRef + "..HEAD",
  ]);
  if (commits.code !== 0) {
    return {
      ok: false,
      commitCount: 0,
      dirty: dirty.stdout.length > 0,
      error: commits.stderr || commits.stdout,
    };
  }

  const count = Number.parseInt(commits.stdout, 10);
  return {
    ok: true,
    commitCount: Number.isFinite(count) ? count : 0,
    dirty: dirty.stdout.length > 0,
  };
}

async function finalizeCompletedRun(
  ctx: PluginContext,
  config: Config,
  state: TaskState,
  status: HarnessRunStatus,
): Promise<void> {
  const outputText = status.result?.outputText ?? "";
  const finalJson = extractFinalJson(outputText);
  const prUrl =
    typeof finalJson?.prUrl === "string" && finalJson.prUrl.trim().length > 0
      ? finalJson.prUrl.trim()
      : extractPrUrl(outputText);
  const summary = typeof finalJson?.summary === "string"
    ? finalJson.summary
    : undefined;
  const worktree = await inspectWorktreeOutcome(state);

  if (!worktree.ok) {
    await markRunFailed(
      ctx,
      config,
      state,
      worktree.error ?? "worktree validation failed",
    );
    return;
  }
  if (worktree.dirty) {
    await markRunFailed(ctx, config, state, "worktree has uncommitted changes");
    return;
  }
  if (worktree.commitCount > 0 && !prUrl) {
    await markRunFailed(
      ctx,
      config,
      state,
      "agent committed code changes but did not report a GitHub PR URL",
    );
    return;
  }
  if (prUrl && state.worktreePath && worktree.commitCount <= 0) {
    await markRunFailed(
      ctx,
      config,
      state,
      "agent reported a PR URL but branch has no commits over base",
    );
    return;
  }

  const nextStatus: TaskStatus = prUrl ? "pr_opened" : "agent_completed";
  const nextState: TaskState = {
    ...state,
    status: nextStatus,
    noteStatus: "active",
    prUrl,
    summary,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
  await setTaskState(ctx, nextState);
  await removeActiveRun(ctx, nextState.taskId, nextState.runId);
  await tryUpdateNoteState(ctx, config, nextState, "active", nextStatus, {
    prUrl,
    summary,
  });
  await ctx.log("yesman agent task completed", {
    ...lifecyclePayload(nextState),
    commitCount: worktree.commitCount,
  });
  await ctx.emit({
    type: prUrl
      ? "yesman-agent-tasks.pr.opened"
      : "yesman-agent-tasks.agent.completed",
    payload: lifecyclePayload(nextState),
  });
}

async function markRunFailed(
  ctx: PluginContext,
  config: Config,
  state: TaskState,
  error: string,
): Promise<void> {
  const nextState: TaskState = {
    ...state,
    status: "failed",
    noteStatus: "blocked",
    lastError: error,
    updatedAt: new Date().toISOString(),
  };
  await setTaskState(ctx, nextState);
  await removeActiveRun(ctx, nextState.taskId, nextState.runId);
  await tryUpdateNoteState(ctx, config, nextState, "blocked", "failed", {
    error,
  });
  await ctx.log("yesman agent task failed", lifecyclePayload(nextState));
  await ctx.emit({
    type: "yesman-agent-tasks.task.failed",
    payload: lifecyclePayload(nextState),
  });
}

async function markRunCancelled(
  ctx: PluginContext,
  config: Config,
  state: TaskState,
  error: string,
): Promise<void> {
  const nextState: TaskState = {
    ...state,
    status: "cancelled",
    noteStatus: "blocked",
    lastError: error,
    updatedAt: new Date().toISOString(),
  };
  await setTaskState(ctx, nextState);
  await removeActiveRun(ctx, nextState.taskId, nextState.runId);
  await tryUpdateNoteState(ctx, config, nextState, "blocked", "cancelled", {
    error,
  });
  await ctx.log("yesman agent task cancelled", lifecyclePayload(nextState));
  await ctx.emit({
    type: "yesman-agent-tasks.task.cancelled",
    payload: lifecyclePayload(nextState),
  });
}

async function markRunInterrupted(
  ctx: PluginContext,
  config: Config,
  state: TaskState,
  error: string,
): Promise<void> {
  const nextState: TaskState = {
    ...state,
    status: "interrupted",
    noteStatus: "blocked",
    lastError: error,
    updatedAt: new Date().toISOString(),
  };
  await setTaskState(ctx, nextState);
  await removeActiveRun(ctx, nextState.taskId, nextState.runId);
  await tryUpdateNoteState(ctx, config, nextState, "blocked", "interrupted", {
    error,
  });
  await ctx.log("yesman agent task interrupted", lifecyclePayload(nextState));
  await ctx.emit({
    type: "yesman-agent-tasks.task.interrupted",
    payload: lifecyclePayload(nextState),
  });
}

async function monitorActiveRuns(
  ctx: PluginContext,
  event: PluginEvent,
): Promise<void> {
  const config = await loadConfig(ctx, eventPayload(event));
  const runs = await getActiveRuns(ctx);
  const results: Array<Record<string, unknown>> = [];

  for (const run of runs) {
    const state = await getTaskState(ctx, run.taskId);
    if (!state) {
      await removeActiveRun(ctx, run.taskId, run.runId);
      results.push({
        taskId: run.taskId,
        runId: run.runId,
        status: "missing_state",
      });
      continue;
    }

    let status: HarnessRunStatus;
    try {
      status = await ctx.harness.status(run.runId);
    } catch (error) {
      await markRunInterrupted(
        ctx,
        config,
        state,
        "harness status unavailable: " + errorMessage(error),
      );
      results.push({
        taskId: run.taskId,
        runId: run.runId,
        status: "interrupted",
      });
      continue;
    }

    if (status.state === "running") {
      if (minutesSince(run.startedAt) > config.agentTimeoutMinutes) {
        try {
          await ctx.harness.cancel(run.runId);
        } catch (error) {
          await ctx.log("failed to cancel timed out harness run", {
            runId: run.runId,
            error: errorMessage(error),
          });
        }
        await markRunCancelled(
          ctx,
          config,
          state,
          "timed out after " + config.agentTimeoutMinutes + " minutes",
        );
        results.push({
          taskId: run.taskId,
          runId: run.runId,
          status: "cancelled",
        });
      } else {
        results.push({
          taskId: run.taskId,
          runId: run.runId,
          status: "running",
        });
      }
      continue;
    }

    if (status.state === "completed") {
      await finalizeCompletedRun(ctx, config, state, status);
      results.push({
        taskId: run.taskId,
        runId: run.runId,
        status: "completed",
      });
    } else if (status.state === "cancelled") {
      await markRunCancelled(ctx, config, state, "harness run cancelled");
      results.push({
        taskId: run.taskId,
        runId: run.runId,
        status: "cancelled",
      });
    } else if (status.state === "failed") {
      await markRunFailed(
        ctx,
        config,
        state,
        status.error ?? "harness run failed",
      );
      results.push({ taskId: run.taskId, runId: run.runId, status: "failed" });
    }
  }

  await ctx.log("yesman agent task monitor completed", {
    activeRunCount: runs.length,
    results,
  });
}

async function reconcileOnStartup(ctx: PluginContext): Promise<void> {
  const config = await loadConfig(ctx, {});
  const runs = await getActiveRuns(ctx);
  for (const run of runs) {
    const state = await getTaskState(ctx, run.taskId);
    if (!state) {
      await removeActiveRun(ctx, run.taskId, run.runId);
      continue;
    }
    try {
      const status = await ctx.harness.status(run.runId);
      if (status.state === "completed") {
        await finalizeCompletedRun(ctx, config, state, status);
      }
      if (status.state === "failed") {
        await markRunFailed(
          ctx,
          config,
          state,
          status.error ?? "harness run failed",
        );
      }
      if (status.state === "cancelled") {
        await markRunCancelled(ctx, config, state, "harness run cancelled");
      }
    } catch {
      await markRunInterrupted(
        ctx,
        config,
        state,
        "YesMan restarted while agent run was active",
      );
    }
  }
}

async function handleReset(
  ctx: PluginContext,
  event: PluginEvent,
): Promise<void> {
  const payload = eventPayload(event);
  const config = await loadConfig(ctx, payload);
  const taskId = asString(payloadValue(payload, "taskId", "task_id"), "");
  const notePath = asString(payloadValue(payload, "notePath", "note_path"), "");
  const resolvedTaskId = taskId ||
    (notePath ? await taskIdForNotePath(config.vaultPath, notePath) : "");
  if (!resolvedTaskId) throw new Error("taskId or notePath is required");

  const state = await getTaskState(ctx, resolvedTaskId);
  if (!state) throw new Error("task state not found: " + resolvedTaskId);

  await removeActiveRun(ctx, state.taskId, state.runId);
  const resetState: TaskState = {
    ...state,
    status: "reset",
    noteStatus: "open",
    runId: undefined,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
  await setTaskState(ctx, resetState);
  await resetNote(config, resetState);
  await ctx.log("yesman agent task reset", lifecyclePayload(resetState));
  await ctx.emit({
    type: "yesman-agent-tasks.task.reset",
    payload: lifecyclePayload(resetState),
  });
}

async function handleCleanup(
  ctx: PluginContext,
  event: PluginEvent,
): Promise<void> {
  const payload = eventPayload(event);
  const taskId = asString(payloadValue(payload, "taskId", "task_id"), "");
  const removeWorktree = asBoolean(
    payloadValue(payload, "removeWorktree", "remove_worktree"),
    false,
  );
  if (!taskId) throw new Error("taskId is required");

  const state = await getTaskState(ctx, taskId);
  if (!state) throw new Error("task state not found: " + taskId);
  if (!state.worktreePath || !state.repoPath) {
    throw new Error("task has no worktree to cleanup");
  }
  if (!removeWorktree) {
    await ctx.log("yesman agent task cleanup dry-run", lifecyclePayload(state));
    return;
  }
  if (!TERMINAL_STATES.has(state.status)) {
    throw new Error(
      "refusing to cleanup non-terminal task state: " + state.status,
    );
  }

  const result = await runGit(state.repoPath, [
    "worktree",
    "remove",
    state.worktreePath,
  ]);
  if (result.code !== 0) {
    throw new Error(
      result.stderr || result.stdout || "git worktree remove failed",
    );
  }
  await ctx.log("yesman agent task worktree removed", lifecyclePayload(state));
}

export default definePlugin((plugin) => {
  plugin.schedule("scan-open-tasks", "* * * * *", {
    type: "yesman-agent-tasks.scan",
    payload: { reason: "minutely schedule" },
  });

  plugin.schedule("monitor-agent-runs", "*/10 * * * *", {
    type: "yesman-agent-tasks.monitor",
    payload: { reason: "monitor schedule" },
  });

  plugin.on("system.started", async (ctx) => {
    await ctx.log("yesman agent tasks plugin ready", {
      events: [
        "yesman-agent-tasks.scan",
        "yesman-agent-tasks.monitor",
        "yesman-agent-tasks.run-one",
        "yesman-agent-tasks.reset",
        "yesman-agent-tasks.cleanup",
      ],
      schedules: { scan: "* * * * *", monitor: "*/10 * * * *" },
    });
    await reconcileOnStartup(ctx);
  });

  plugin.on("yesman-agent-tasks.scan", handleScan);
  plugin.on("yesman-agent-tasks.run-one", handleRunOne);
  plugin.on("yesman-agent-tasks.monitor", monitorActiveRuns);
  plugin.on("yesman-agent-tasks.reset", handleReset);
  plugin.on("yesman-agent-tasks.cleanup", handleCleanup);
});
