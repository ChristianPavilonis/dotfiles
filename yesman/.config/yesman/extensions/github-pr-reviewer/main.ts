type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

type Repository = {
  name: string;
  repo: string;
  cwd: string;
  workspaceId: string;
  enabled: boolean;
};

type Settings = {
  enabled: boolean;
  pollIntervalSeconds: number;
  maxPrsPerPoll: number;
  listLimit: number;
  maxPrAgeHours: number;
  skipDrafts: boolean;
  repositories: Repository[];
};

type PullRequest = {
  number: number;
  title: string;
  url: string;
  headRefOid: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  updatedAt?: string;
};

type HostState = {
  settings: Settings;
  enabledWorkspaces: Set<string>;
  initialized: boolean;
  polling: boolean;
  shuttingDown: boolean;
  timer?: number;
};

const EXTENSION_ID = "github-pr-reviewer";
const EXTENSION_RELEASE = "0.1.0";
const DEFAULT_POLL_INTERVAL_SECONDS = 900;
const DEFAULT_MAX_PRS_PER_POLL = 1;
const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_MAX_PR_AGE_HOURS = 24;
const REQUEST_TIMEOUT_MS = 30_000;
const pendingRequests = new Map<string, number>();

const state: HostState = {
  settings: defaultSettings(),
  enabledWorkspaces: new Set(),
  initialized: false,
  polling: false,
  shuttingDown: false,
};

if (import.meta.main) {
  await run();
}

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
    if (state.timer !== undefined) clearInterval(state.timer);
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
    await handleResponse(frame);
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
    repositories: state.settings.repositories.map((repository) =>
      repository.name
    ),
    enabledWorkspaceCount: state.enabledWorkspaces.size,
  });
}

async function shutdown(frame: JsonObject): Promise<void> {
  state.shuttingDown = true;
  state.initialized = false;
  if (state.timer !== undefined) clearInterval(state.timer);
  state.timer = undefined;
  if (typeof frame.id === "string") await respond(frame.id, { accepted: true });
}

async function handleResponse(frame: JsonObject): Promise<void> {
  if (typeof frame.id !== "string" || !pendingRequests.delete(frame.id)) return;
  if (isObject(frame.error)) {
    log("host rejected PR review conversation request", {
      requestId: frame.id,
      code: frame.error.code,
      message: frame.error.message,
    });
    return;
  }
  const details: JsonObject = { requestId: frame.id };
  if (isObject(frame.result)) details.result = compactResult(frame.result);
  log("host accepted PR review conversation request", details);
}

function startPolling(): void {
  if (state.timer !== undefined) clearInterval(state.timer);
  void poll();
  state.timer = setInterval(
    () => void poll(),
    state.settings.pollIntervalSeconds * 1000,
  );
}

async function poll(): Promise<void> {
  if (
    !state.initialized || state.shuttingDown || state.polling ||
    !state.settings.enabled
  ) return;
  state.polling = true;
  try {
    expireUnansweredRequests();
    let dispatched = 0;
    for (const repository of state.settings.repositories) {
      if (dispatched >= state.settings.maxPrsPerPoll) break;
      if (!repository.enabled) continue;
      if (!state.enabledWorkspaces.has(repository.workspaceId)) {
        log(
          "repository skipped because its workspace is not enabled for this generation",
          {
            repository: repository.repo,
            workspaceId: repository.workspaceId,
          },
        );
        continue;
      }

      const pullRequests = await listPullRequests(
        repository,
        state.settings.listLimit,
      );
      const viewer = await viewerLogin(repository.cwd);
      for (const pullRequest of pullRequests) {
        if (dispatched >= state.settings.maxPrsPerPoll) break;
        if (shouldSkip(pullRequest, state.settings)) continue;
        if (await hasSubmittedReview(repository, pullRequest, viewer)) {
          log(
            "PR skipped because the authenticated GitHub user already reviewed this head",
            {
              repository: repository.repo,
              pr: pullRequest.number,
              head: pullRequest.headRefOid,
            },
          );
          continue;
        }
        const requestId = await reviewRequestId(repository, pullRequest);
        if (pendingRequests.has(requestId)) continue;

        const worktree = await openWorktree(repository, pullRequest);
        if (
          !await isStillReviewRequested(
            repository,
            pullRequest,
            state.settings.listLimit,
          )
        ) {
          log(
            "PR skipped because its review request or head changed before dispatch",
            {
              repository: repository.repo,
              pr: pullRequest.number,
            },
          );
          continue;
        }
        const prompt = buildReviewPrompt(repository, pullRequest, worktree);
        pendingRequests.set(requestId, Date.now());
        await sendRequest(requestId, "conversations.create", {
          workspace_id: repository.workspaceId,
          title: conversationTitle(repository, pullRequest),
          text: prompt,
        });
        dispatched++;
      }
    }
  } catch (error) {
    log("PR review poll failed", { error: errorMessage(error) });
  } finally {
    state.polling = false;
  }
}

async function listPullRequests(
  repository: Repository,
  limit: number,
): Promise<PullRequest[]> {
  const fields =
    "number,title,url,headRefOid,headRefName,baseRefName,isDraft,updatedAt";
  const output = await command("gh", [
    "pr",
    "list",
    "--repo",
    repository.repo,
    "--state",
    "open",
    "--search",
    "review-requested:@me",
    "--limit",
    String(limit),
    "--json",
    fields,
  ], repository.cwd);
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.stdout);
  } catch {
    throw new Error(`gh pr list returned invalid JSON for ${repository.repo}`);
  }
  return Array.isArray(parsed)
    ? parsed.map(parsePullRequest).filter((value): value is PullRequest =>
      value !== null
    )
    : [];
}

async function isStillReviewRequested(
  repository: Repository,
  pullRequest: PullRequest,
  limit: number,
): Promise<boolean> {
  const current = await listPullRequests(repository, limit);
  return current.some((candidate) =>
    candidate.number === pullRequest.number &&
    candidate.headRefOid === pullRequest.headRefOid &&
    !(state.settings.skipDrafts && candidate.isDraft)
  );
}

function expireUnansweredRequests(): void {
  const deadline = Date.now() - REQUEST_TIMEOUT_MS;
  for (const [requestId, sentAt] of pendingRequests) {
    if (sentAt <= deadline) {
      pendingRequests.delete(requestId);
      log("retrying an unanswered durable conversation request", { requestId });
    }
  }
}

async function viewerLogin(cwd: string): Promise<string> {
  return (await command("gh", ["api", "user", "--jq", ".login"], cwd)).stdout
    .trim();
}

async function hasSubmittedReview(
  repository: Repository,
  pullRequest: PullRequest,
  viewer: string,
): Promise<boolean> {
  const [owner, name] = repository.repo.split("/");
  if (!owner || !name) {
    throw new Error(`invalid repository name: ${repository.repo}`);
  }
  const output = await command(
    "gh",
    [
      "api",
      "--paginate",
      "--slurp",
      `repos/${owner}/${name}/pulls/${pullRequest.number}/reviews?per_page=100`,
    ],
    repository.cwd,
  );
  let reviews: unknown;
  try {
    reviews = JSON.parse(output.stdout);
  } catch {
    throw new Error(
      `gh review query returned invalid JSON for ${repository.repo}`,
    );
  }
  const flattened = Array.isArray(reviews)
    ? reviews.flatMap((page) => Array.isArray(page) ? page : [page])
    : [];
  return flattened.some((review) => {
    if (!isObject(review) || !isObject(review.user)) return false;
    return review.user.login === viewer &&
      review.commit_id === pullRequest.headRefOid &&
      (review.state === "APPROVED" ||
        review.state === "COMMENTED" ||
        review.state === "CHANGES_REQUESTED");
  });
}

async function openWorktree(
  repository: Repository,
  pullRequest: PullRequest,
): Promise<string> {
  const output = await command(
    "nu",
    ["-l", "-c", `gwpr ${pullRequest.number}; pwd`],
    repository.cwd,
  );
  const worktree = output.stdout.split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith("/"));
  if (!worktree) {
    throw new Error(
      `gwpr did not report a worktree for PR #${pullRequest.number}`,
    );
  }
  const head = (await command("git", ["rev-parse", "HEAD"], worktree)).stdout
    .trim();
  if (head !== pullRequest.headRefOid) {
    throw new Error(
      `worktree for PR #${pullRequest.number} is not at its requested head`,
    );
  }
  return worktree;
}

function shouldSkip(pullRequest: PullRequest, settings: Settings): boolean {
  if (settings.skipDrafts && pullRequest.isDraft) return true;
  if (!pullRequest.updatedAt) return false;
  const updatedAt = Date.parse(pullRequest.updatedAt);
  return Number.isFinite(updatedAt) &&
    (Date.now() - updatedAt) > settings.maxPrAgeHours * 3_600_000;
}

export function conversationTitle(
  repository: Repository,
  pullRequest: PullRequest,
): string {
  // The protocol schema conservatively caps title at 128 Unicode code points.
  return Array.from(`Review ${repository.repo} PR #${pullRequest.number}`)
    .slice(0, 128)
    .join("");
}

function buildReviewPrompt(
  repository: Repository,
  pullRequest: PullRequest,
  worktree: string,
): string {
  return `Review GitHub pull request #${pullRequest.number} for ${repository.repo}.

Repository: ${repository.repo}
PR URL: ${pullRequest.url}
Worktree: ${worktree}
Base branch: ${pullRequest.baseRefName}
Head branch: ${pullRequest.headRefName}
Head SHA: ${pullRequest.headRefOid}

Use the worktree above, not the default workspace directory. Inspect the PR diff, relevant callers, and tests. Do not modify files or push commits.

If the review has blocking correctness, security, authorization, data-loss, or severe compatibility findings, submit REQUEST_CHANGES with concise evidence and inline comments where appropriate. Otherwise submit COMMENT, including a short no-blockers comment. Never APPROVE.

Use GitHub CLI commands to submit the review from the configured authenticated account. Before submission, re-check the PR head still matches ${pullRequest.headRefOid}; do not submit a review if it changed. Finish only after GitHub confirms submission.`;
}

export async function reviewRequestId(
  repository: Repository,
  pullRequest: PullRequest,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${repository.repo}\u0000${pullRequest.number}\u0000${pullRequest.headRefOid}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `github-pr-review:${toHex(new Uint8Array(digest)).slice(0, 32)}`;
}

async function sendRequest(
  id: string,
  method: string,
  params: JsonObject,
): Promise<void> {
  await writeFrame({ jsonrpc: "2.0", id, method, params });
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
  const bytes = new TextEncoder().encode(`${JSON.stringify(frame)}\n`);
  const writer = Deno.stdout.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
  }
}

async function command(
  name: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  const output = await new Deno.Command(name, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  const stdout = decoder.decode(output.stdout);
  const stderr = decoder.decode(output.stderr);
  if (!output.success) {
    throw new Error(`${name} failed (${output.code}): ${stderr.trim()}`);
  }
  return { stdout, stderr };
}

export function parseSettings(value: Json | undefined): Settings {
  const config = isObject(value) ? value : {};
  const repositories = Array.isArray(config.repositories)
    ? config.repositories.map(parseRepository).filter((
      value,
    ): value is Repository => value !== null)
    : [];
  return {
    enabled: config.enabled === true,
    pollIntervalSeconds: positiveInteger(
      config.poll_interval_seconds,
      DEFAULT_POLL_INTERVAL_SECONDS,
      60,
      86_400,
    ),
    maxPrsPerPoll: positiveInteger(
      config.max_prs_per_poll,
      DEFAULT_MAX_PRS_PER_POLL,
      1,
      10,
    ),
    listLimit: positiveInteger(config.list_limit, DEFAULT_LIST_LIMIT, 1, 100),
    maxPrAgeHours: positiveInteger(
      config.max_pr_age_hours,
      DEFAULT_MAX_PR_AGE_HOURS,
      1,
      24 * 30,
    ),
    skipDrafts: config.skip_drafts !== false,
    repositories,
  };
}

function defaultSettings(): Settings {
  return parseSettings({});
}

function parseRepository(value: Json): Repository | null {
  if (!isObject(value)) return null;
  const name = nonEmptyString(value.name);
  const repo = nonEmptyString(value.repo);
  const cwd = nonEmptyString(value.cwd);
  const workspaceId = nonEmptyString(value.workspace_id);
  if (!name || !repo || !cwd || !workspaceId) return null;
  return { name, repo, cwd, workspaceId, enabled: value.enabled !== false };
}

export function parsePullRequest(value: Json): PullRequest | null {
  if (!isObject(value)) return null;
  const number = value.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    return null;
  }
  const title = nonEmptyString(value.title);
  const url = nonEmptyString(value.url);
  const headRefOid = nonEmptyString(value.headRefOid);
  const headRefName = nonEmptyString(value.headRefName);
  const baseRefName = nonEmptyString(value.baseRefName);
  if (
    !title || !url || !headRefOid || !headRefName || !baseRefName ||
    typeof value.isDraft !== "boolean"
  ) {
    return null;
  }
  return {
    number,
    title,
    url,
    headRefOid,
    headRefName,
    baseRefName,
    isDraft: value.isDraft,
    updatedAt: nonEmptyString(value.updatedAt),
  };
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

function compactResult(value: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const key of ["state", "conversation_id", "input_id", "run_id"]) {
    if (typeof value[key] === "string") result[key] = value[key];
  }
  return result;
}

function positiveInteger(
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

function nonEmptyString(value: Json | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function log(message: string, details?: JsonObject): void {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.error(`[${EXTENSION_ID}] ${message}${suffix}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
