import {
  definePlugin,
  type HarnessRunResult,
  type PluginContext,
  type PluginEvent,
} from "@yesman/sdk";

const DEFAULT_HARNESS_NAME = "github-auto-review.pi";
const POLL_SCHEDULE = "0 15 * * * *";
const REVIEW_RESULT_MARKER = "REVIEW_RESULT:";
const REVIEW_PROMPT_TEMPLATE_PATHS = [
  "/home/christian/.pi/agent/prompts/ts-review.md",
  "/home/christian/dotfiles/pi/.pi/agent/prompts/ts-review.md",
];
const DEFAULT_MAX_PRS_PER_TICK = 1;
const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_MAX_PR_AGE_HOURS = 24;
const DEFAULT_AGENT_TIMEOUT_MINUTES = 10;
const DEFAULT_THINKING = "xhigh";

const DEFAULT_REPOSITORIES: RepositoryConfig[] = [
  {
    name: "trusted-server",
    cwd: "/home/christian/projects/trusted-server",
    repo: "IABTechLab/trusted-server",
    enabled: true,
    skipDrafts: true,
  },
];

const DEFAULT_REVIEW_PROMPT = `Additional automated-review notes:
- Submit REQUEST_CHANGES only for blocking correctness, security, data-loss, authorization, or severe compatibility issues.
- Submit COMMENT otherwise, including when no blocking issues are found.`;

type RepositoryConfig = {
  name: string;
  cwd: string;
  repo: string;
  enabled: boolean;
  skipDrafts: boolean;
};

type Settings = {
  enabled: boolean;
  repositories: RepositoryConfig[];
  harnessName: string;
  thinking: string;
  provider?: string;
  model?: string;
  tools?: string[];
  reviewPrompt: string;
  maxPrsPerTick: number;
  listLimit: number;
  maxPrAgeHours: number;
  agentTimeoutMinutes: number;
};

type PullRequest = {
  number: number;
  title: string;
  url: string;
  author?: { login?: string };
  headRefOid: string;
  baseRefName: string;
  headRefName: string;
  isDraft: boolean;
  updatedAt?: string;
  changedFiles?: number;
  additions?: number;
  deletions?: number;
};

type GitHubReview = {
  id?: number;
  html_url?: string;
  state?: string;
  commit_id?: string;
  submitted_at?: string;
  body?: string;
  user?: { login?: string };
};

type ReviewResultMarker = {
  submitted?: boolean;
  review_url?: string;
  event?: string;
  inline_comments?: number;
  error?: string;
};

type CommandResult = {
  command: string;
  args: string[];
  cwd?: string;
  code: number;
  stdout: string;
  stderr: string;
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

let pollInFlight = false;
const activeReviewKeys = new Set<string>();

export default definePlugin((plugin) => {
  plugin.harness(DEFAULT_HARNESS_NAME, {
    kind: "pi_rpc",
    thinking: DEFAULT_THINKING,
  });

  plugin.schedule("poll-review-requests", POLL_SCHEDULE, {
    type: "github-auto-review.poll",
    payload: { reason: "schedule" },
  });

  plugin.on("github-auto-review.poll", async (ctx, event) => {
    await pollReviewRequests(ctx, event);
  });
});

async function pollReviewRequests(ctx: PluginContext, event: PluginEvent) {
  if (pollInFlight) {
    await ctx.log("github-auto-review poll skipped: another poll is in flight", {
      event: event.id,
    });
    return;
  }

  pollInFlight = true;
  const startedAt = new Date().toISOString();

  try {
    const settings = await getSettings(ctx);
    if (!settings.enabled) {
      await ctx.log("github-auto-review disabled; skipping poll");
      return;
    }

    const repoFilter = getRepoFilter(event.payload);
    const repositories = settings.repositories.filter((repo) => {
      if (!repo.enabled) return false;
      if (repoFilter === null) return true;
      return repoFilter.has(repo.name) || repoFilter.has(repo.repo);
    });

    await ctx.emit({
      type: "github-auto-review.poll.started",
      payload: {
        reason: getPayloadString(event.payload, "reason") ?? "unknown",
        started_at: startedAt,
        repositories: repositories.map((repo) => ({ name: repo.name, repo: repo.repo, cwd: repo.cwd })),
        max_prs_per_tick: settings.maxPrsPerTick,
        max_pr_age_hours: settings.maxPrAgeHours,
        thinking: settings.thinking,
      },
    });

    let discovered = 0;
    let reviewed = 0;
    let skipped = 0;
    let failed = 0;

    for (const repo of repositories) {
      if (reviewed >= settings.maxPrsPerTick) break;

      let reviewerLogin: string | null = null;
      try {
        reviewerLogin = await getViewerLogin(repo);
      } catch (error) {
        failed++;
        await ctx.log("github-auto-review failed to identify gh viewer; skipping repo", {
          repo: repo.repo,
          cwd: repo.cwd,
          error: stringifyError(error),
        });
        continue;
      }

      let pullRequests: PullRequest[] = [];
      try {
        pullRequests = await listReviewRequestedPullRequests(repo, settings.listLimit);
      } catch (error) {
        failed++;
        await ctx.log("github-auto-review failed to list review-requested PRs", {
          repo: repo.repo,
          cwd: repo.cwd,
          error: stringifyError(error),
        });
        continue;
      }

      discovered += pullRequests.length;
      await ctx.log("github-auto-review discovered review-requested PRs", {
        repo: repo.repo,
        count: pullRequests.length,
        prs: pullRequests.map((pr) => ({ number: pr.number, title: pr.title, head: pr.headRefOid })),
      });

      for (const pr of pullRequests) {
        if (reviewed >= settings.maxPrsPerTick) break;

        const outcome = await reviewPullRequestIfNeeded(ctx, settings, repo, pr, reviewerLogin);
        if (outcome === "reviewed") reviewed++;
        if (outcome === "skipped") skipped++;
        if (outcome === "failed") failed++;
      }
    }

    const completedAt = new Date().toISOString();
    await ctx.emit({
      type: "github-auto-review.poll.completed",
      payload: {
        started_at: startedAt,
        completed_at: completedAt,
        discovered,
        reviewed,
        skipped,
        failed,
      },
    });

    await ctx.log("github-auto-review poll completed", {
      started_at: startedAt,
      completed_at: completedAt,
      discovered,
      reviewed,
      skipped,
      failed,
    });
  } finally {
    pollInFlight = false;
  }
}

async function reviewPullRequestIfNeeded(
  ctx: PluginContext,
  settings: Settings,
  repo: RepositoryConfig,
  pr: PullRequest,
  reviewerLogin: string,
): Promise<"reviewed" | "skipped" | "failed"> {
  const reviewKey = reviewedKey(repo.repo, pr.number, pr.headRefOid);

  if (repo.skipDrafts && pr.isDraft) {
    await emitSkipped(ctx, repo, pr, "draft PR");
    return "skipped";
  }

  const ageHours = pullRequestAgeHours(pr);
  if (ageHours !== null && ageHours > settings.maxPrAgeHours) {
    await emitSkipped(ctx, repo, pr, "PR is older than configured max age", {
      updated_at: pr.updatedAt,
      age_hours: Math.round(ageHours * 100) / 100,
      max_pr_age_hours: settings.maxPrAgeHours,
    });
    return "skipped";
  }

  if (activeReviewKeys.has(reviewKey)) {
    await emitSkipped(ctx, repo, pr, "review already active in this process");
    return "skipped";
  }

  const priorState = await ctx.kv.get(reviewKey);
  if (priorState !== null) {
    await emitSkipped(ctx, repo, pr, "head SHA already marked reviewed");
    return "skipped";
  }

  try {
    const existingReview = await findSubmittedReview(repo, pr.number, pr.headRefOid, reviewerLogin);
    if (existingReview !== null) {
      await ctx.kv.set(reviewKey, {
        repo: repo.repo,
        pr: pr.number,
        head_sha: pr.headRefOid,
        skipped_at: new Date().toISOString(),
        reason: "viewer already reviewed this head SHA",
        review_url: existingReview.html_url,
        review_state: existingReview.state,
      });
      await emitSkipped(ctx, repo, pr, "viewer already reviewed this head SHA", {
        review_url: existingReview.html_url,
        review_state: existingReview.state,
      });
      return "skipped";
    }
  } catch (error) {
    await ctx.log("github-auto-review could not check existing reviews; continuing", {
      repo: repo.repo,
      pr: pr.number,
      error: stringifyError(error),
    });
  }

  activeReviewKeys.add(reviewKey);
  const startedAt = new Date().toISOString();

  try {
    await ctx.emit({
      type: "github-auto-review.review.started",
      payload: reviewPayload(repo, pr, { started_at: startedAt, thinking: settings.thinking }),
    });

    await ctx.log("github-auto-review opening PR worktree", {
      repo: repo.repo,
      pr: pr.number,
      head_sha: pr.headRefOid,
    });

    const worktreePath = await openPrWorktree(ctx, repo, pr);
    await assertWorktreeAtHead(worktreePath, pr.headRefOid);

    const stillRequested = await isStillReviewRequested(
      repo,
      pr.number,
      pr.headRefOid,
      repo.skipDrafts,
      settings.listLimit,
    );
    if (!stillRequested) {
      await emitSkipped(ctx, repo, pr, "PR no longer requests review from current gh user");
      return "skipped";
    }

    const prompt = await buildReviewPrompt(repo, pr, worktreePath, settings.reviewPrompt);
    const harnessResult = await runReviewHarness(ctx, settings, worktreePath, prompt);

    const submittedReview = await findSubmittedReview(
      repo,
      pr.number,
      pr.headRefOid,
      reviewerLogin,
      startedAt,
    );
    const marker = extractReviewResultMarker(harnessResult.outputText);
    const fallbackUrl = marker?.review_url ?? extractGitHubReviewUrl(harnessResult.outputText);

    if (submittedReview === null && !fallbackUrl) {
      await ctx.emit({
        type: "github-auto-review.review.failed",
        payload: reviewPayload(repo, pr, {
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          reason: "Pi run completed, but no submitted review could be verified",
          marker,
        }),
      });
      await ctx.log("github-auto-review review completed without verifiable submission", {
        repo: repo.repo,
        pr: pr.number,
        head_sha: pr.headRefOid,
        run_output_tail: tail(harnessResult.outputText, 4000),
        marker,
      });
      return "failed";
    }

    const completedAt = new Date().toISOString();
    await ctx.kv.set(reviewKey, {
      repo: repo.repo,
      pr: pr.number,
      head_sha: pr.headRefOid,
      worktree_path: worktreePath,
      started_at: startedAt,
      completed_at: completedAt,
      review_url: submittedReview?.html_url ?? fallbackUrl,
      review_state: submittedReview?.state ?? marker?.event,
      marker,
    });

    await ctx.emit({
      type: "github-auto-review.review.submitted",
      payload: reviewPayload(repo, pr, {
        started_at: startedAt,
        completed_at: completedAt,
        worktree_path: worktreePath,
        review_url: submittedReview?.html_url ?? fallbackUrl,
        review_state: submittedReview?.state ?? marker?.event,
        inline_comments: marker?.inline_comments,
      }),
    });

    await ctx.log("github-auto-review submitted review", {
      repo: repo.repo,
      pr: pr.number,
      head_sha: pr.headRefOid,
      review_url: submittedReview?.html_url ?? fallbackUrl,
      review_state: submittedReview?.state ?? marker?.event,
      inline_comments: marker?.inline_comments,
    });

    return "reviewed";
  } catch (error) {
    const completedAt = new Date().toISOString();
    await ctx.emit({
      type: "github-auto-review.review.failed",
      payload: reviewPayload(repo, pr, {
        started_at: startedAt,
        completed_at: completedAt,
        error: stringifyError(error),
      }),
    });
    await ctx.log("github-auto-review review failed", {
      repo: repo.repo,
      pr: pr.number,
      head_sha: pr.headRefOid,
      error: stringifyError(error),
    });
    return "failed";
  } finally {
    activeReviewKeys.delete(reviewKey);
  }
}

async function runReviewHarness(
  ctx: PluginContext,
  settings: Settings,
  cwd: string,
  prompt: string,
): Promise<HarnessRunResult> {
  const input = {
    prompt,
    cwd,
    thinking: settings.thinking,
    ...(settings.provider ? { provider: settings.provider } : {}),
    ...(settings.model ? { model: settings.model } : {}),
    ...(settings.tools ? { tools: settings.tools } : {}),
  };

  const run = await ctx.harness.start(settings.harnessName, input);
  await ctx.log("github-auto-review Pi harness run started", {
    runId: run.runId,
    cwd,
    thinking: settings.thinking,
    provider: settings.provider,
    model: settings.model,
    tools: settings.tools,
    timeoutMinutes: settings.agentTimeoutMinutes,
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void ctx.harness.cancel(run.runId).catch((error: unknown) => {
      void ctx.log("github-auto-review failed to cancel timed out harness run", {
        runId: run.runId,
        error: stringifyError(error),
      });
    });
  }, settings.agentTimeoutMinutes * 60_000);

  let outputText = "";
  let rawEventCount = 0;
  let toolCallCount = 0;
  let result: HarnessRunResult | undefined;

  try {
    for await (const streamEvent of ctx.harness.stream(run.runId)) {
      switch (streamEvent.type) {
        case "text_delta":
          outputText += streamEvent.delta;
          break;
        case "raw_event":
          rawEventCount++;
          break;
        case "tool_call_start":
          toolCallCount++;
          await ctx.log("github-auto-review Pi tool call", {
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

  await ctx.log("github-auto-review Pi harness run completed", {
    runId: run.runId,
    rawEventCount,
    toolCallCount,
    outputLength: completedResult.outputText.length || outputText.length,
  });

  return completedResult;
}

async function openPrWorktree(
  ctx: PluginContext,
  repo: RepositoryConfig,
  pr: PullRequest,
): Promise<string> {
  const result = await runCommand("nu", ["-l", "-c", `gwpr ${pr.number}; pwd`], { cwd: repo.cwd });
  const candidate = parseWorktreePath(result.stdout);

  if (candidate) {
    const head = await tryGitHead(candidate);
    if (head === pr.headRefOid) return candidate;

    await ctx.log("github-auto-review gwpr returned a path whose HEAD did not match PR head", {
      repo: repo.repo,
      pr: pr.number,
      candidate,
      expected: pr.headRefOid,
      actual: head,
    });
  }

  const fallback = await findWorktreeByHead(repo.cwd, pr.headRefOid);
  if (fallback !== null) return fallback;

  throw new Error(
    `gwpr did not produce a worktree at PR head ${pr.headRefOid}; stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

async function assertWorktreeAtHead(worktreePath: string, expectedHead: string) {
  const actualHead = await gitHead(worktreePath);
  if (actualHead !== expectedHead) {
    throw new Error(
      `worktree ${worktreePath} is at ${actualHead}, expected PR head ${expectedHead}`,
    );
  }
}

async function findWorktreeByHead(repoCwd: string, headSha: string): Promise<string | null> {
  const result = await runCommand("git", ["worktree", "list", "--porcelain"], { cwd: repoCwd });
  const records = parseWorktreePorcelain(result.stdout);
  const match = records.find((record) => record.head === headSha);
  return match?.path ?? null;
}

async function tryGitHead(cwd: string): Promise<string | null> {
  try {
    return await gitHead(cwd);
  } catch {
    return null;
  }
}

async function gitHead(cwd: string): Promise<string> {
  return (await runText("git", ["rev-parse", "HEAD"], { cwd })).trim();
}

function parseWorktreePorcelain(text: string): Array<{ path: string; head?: string }> {
  const records: Array<{ path: string; head?: string }> = [];
  let current: { path: string; head?: string } | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      if (current !== null) records.push(current);
      current = null;
      continue;
    }

    if (line.startsWith("worktree ")) {
      if (current !== null) records.push(current);
      current = { path: line.slice("worktree ".length) };
      continue;
    }

    if (line.startsWith("HEAD ") && current !== null) {
      current.head = line.slice("HEAD ".length);
    }
  }

  if (current !== null) records.push(current);
  return records;
}

function parseWorktreePath(stdout: string): string | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (line.startsWith("/")) return line;
  }

  return null;
}

async function listReviewRequestedPullRequests(
  repo: RepositoryConfig,
  limit: number,
): Promise<PullRequest[]> {
  const fields = [
    "number",
    "title",
    "url",
    "author",
    "headRefOid",
    "baseRefName",
    "headRefName",
    "isDraft",
    "updatedAt",
    "changedFiles",
    "additions",
    "deletions",
  ].join(",");

  const value = await runJson<unknown>("gh", [
    "pr",
    "list",
    "--repo",
    repo.repo,
    "--state",
    "open",
    "--search",
    "review-requested:@me",
    "--limit",
    String(limit),
    "--json",
    fields,
  ], { cwd: repo.cwd });

  if (!Array.isArray(value)) return [];
  return value.map(parsePullRequest).filter((pr): pr is PullRequest => pr !== null);
}

async function isStillReviewRequested(
  repo: RepositoryConfig,
  prNumber: number,
  headSha: string,
  skipDrafts: boolean,
  listLimit: number,
): Promise<boolean> {
  const prs = await listReviewRequestedPullRequests(repo, listLimit);
  const match = prs.find((pr) => pr.number === prNumber);
  if (!match) return false;
  if (match.headRefOid !== headSha) return false;
  if (skipDrafts && match.isDraft) return false;
  return true;
}

async function getViewerLogin(repo: RepositoryConfig): Promise<string> {
  return (await runText("gh", ["api", "user", "--jq", ".login"], { cwd: repo.cwd })).trim();
}

async function findSubmittedReview(
  repo: RepositoryConfig,
  prNumber: number,
  headSha: string,
  reviewerLogin: string,
  submittedAfter?: string,
): Promise<GitHubReview | null> {
  const [owner, repoName] = splitRepo(repo.repo);
  const value = await runJson<unknown>("gh", [
    "api",
    `repos/${owner}/${repoName}/pulls/${prNumber}/reviews?per_page=100`,
  ], { cwd: repo.cwd });

  if (!Array.isArray(value)) return null;

  const submittedAfterMs = submittedAfter ? Date.parse(submittedAfter) : null;
  const matches = value
    .map(parseGitHubReview)
    .filter((review): review is GitHubReview => review !== null)
    .filter((review) => review.user?.login === reviewerLogin)
    .filter((review) => review.commit_id === headSha)
    .filter((review) => review.state !== "DISMISSED")
    .filter((review) => {
      if (submittedAfterMs === null || !Number.isFinite(submittedAfterMs)) return true;
      if (!review.submitted_at) return false;
      const reviewSubmittedAt = Date.parse(review.submitted_at);
      return Number.isFinite(reviewSubmittedAt) && reviewSubmittedAt >= submittedAfterMs - 60_000;
    })
    .sort((left, right) => {
      const leftTime = left.submitted_at ? Date.parse(left.submitted_at) : 0;
      const rightTime = right.submitted_at ? Date.parse(right.submitted_at) : 0;
      return rightTime - leftTime;
    });

  return matches[0] ?? null;
}

async function buildReviewPrompt(
  repo: RepositoryConfig,
  pr: PullRequest,
  worktreePath: string,
  reviewPrompt: string,
): Promise<string> {
  const template = await loadReviewPromptTemplate();
  const target = `PR #${pr.number}

Repository: ${repo.repo}
Worktree: ${worktreePath}
PR title: ${pr.title}
PR URL: ${pr.url}
Base branch: ${pr.baseRefName}
Head branch: ${pr.headRefName}
Head SHA: ${pr.headRefOid}

This is an automated review launched by the github-auto-review plugin.

Additional automated-review instructions:
${reviewPrompt.trim() || "None."}`;
  const renderedReviewPrompt = renderPromptTemplate(template, target);

  return `${renderedReviewPrompt}

Automation/submission instructions:
- You MUST submit the review to GitHub before finishing.
- Use the submit-gh-pr-review skill to submit the final review.
- The submitted review body must start with "Automated review:".
- Relevant inline comments should also make it clear they are from an automated review.
- Submit only COMMENT or REQUEST_CHANGES.
- Use REQUEST_CHANGES only for blocking correctness, security, data-loss, authorization, or severe compatibility issues.
- Use COMMENT otherwise.
- Do not APPROVE. If the submit-gh-pr-review skill's default rules mention approving when there are no findings, override that for this workflow and submit COMMENT instead.
- If no blocking issues are found, submit a COMMENT review saying the automated review found no blocking issues.

After submitting, end your response with exactly one machine-readable result line using this format:
${REVIEW_RESULT_MARKER} {"submitted":true,"review_url":"https://github.com/...","event":"COMMENT or REQUEST_CHANGES","inline_comments":0}
`;
}

async function loadReviewPromptTemplate(): Promise<string> {
  const errors: string[] = [];
  for (const path of REVIEW_PROMPT_TEMPLATE_PATHS) {
    try {
      return await Deno.readTextFile(path);
    } catch (error) {
      errors.push(`${path}: ${stringifyError(error)}`);
    }
  }

  throw new Error(`failed to read Trusted Server review prompt template:\n${errors.join("\n")}`);
}

function renderPromptTemplate(template: string, args: string): string {
  return stripPromptFrontmatter(template).replaceAll("$@", args.trim());
}

function stripPromptFrontmatter(text: string): string {
  if (!text.startsWith("---")) return text.trim();
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? text.slice(match[0].length).trim() : text.trim();
}

async function getSettings(ctx: PluginContext): Promise<Settings> {
  const enabled = (await ctx.config.get<boolean>("enabled")) ?? true;
  const repositories = parseRepositories(await ctx.config.get<unknown>("repositories")) ??
    DEFAULT_REPOSITORIES;
  const harnessName = parseNonEmptyString(await ctx.config.get<unknown>("harness_name")) ??
    DEFAULT_HARNESS_NAME;
  const thinking = parseNonEmptyString(await ctx.config.get<unknown>("thinking")) ?? DEFAULT_THINKING;
  const provider = parseNonEmptyString(await ctx.config.get<unknown>("provider")) ?? undefined;
  const model = parseNonEmptyString(await ctx.config.get<unknown>("model")) ?? undefined;
  const tools = parseStringArray(await ctx.config.get<unknown>("tools")) ?? undefined;
  const reviewPrompt = parseNonEmptyString(await ctx.config.get<unknown>("review_prompt")) ??
    DEFAULT_REVIEW_PROMPT;
  const maxPrsPerTick = parsePositiveInteger(
    await ctx.config.get<unknown>("max_prs_per_tick"),
    DEFAULT_MAX_PRS_PER_TICK,
  );
  const listLimit = parsePositiveInteger(
    await ctx.config.get<unknown>("list_limit"),
    DEFAULT_LIST_LIMIT,
  );
  const maxPrAgeHours = parsePositiveNumber(
    await ctx.config.get<unknown>("max_pr_age_hours"),
    DEFAULT_MAX_PR_AGE_HOURS,
  );
  const agentTimeoutMinutes = parsePositiveInteger(
    await ctx.config.get<unknown>("agent_timeout_minutes"),
    DEFAULT_AGENT_TIMEOUT_MINUTES,
  );

  return {
    enabled,
    repositories,
    harnessName,
    thinking,
    provider,
    model,
    tools,
    reviewPrompt,
    maxPrsPerTick,
    listLimit,
    maxPrAgeHours,
    agentTimeoutMinutes,
  };
}

function parseRepositories(value: unknown): RepositoryConfig[] | null {
  const parsed = typeof value === "string" ? tryJsonParse(value) : value;
  if (!Array.isArray(parsed)) return null;

  const repos = parsed.map(parseRepositoryConfig).filter((repo): repo is RepositoryConfig => {
    return repo !== null;
  });

  return repos.length > 0 ? repos : null;
}

function parseRepositoryConfig(value: unknown): RepositoryConfig | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = parseNonEmptyString(record.name) ?? parseNonEmptyString(record.repo);
  const cwd = parseNonEmptyString(record.cwd);
  const repo = parseNonEmptyString(record.repo);

  if (!name || !cwd || !repo) return null;

  return {
    name,
    cwd,
    repo,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    skipDrafts: typeof record.skipDrafts === "boolean" ? record.skipDrafts : true,
  };
}

function parsePullRequest(value: unknown): PullRequest | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const number = record.number;
  const title = record.title;
  const url = record.url;
  const headRefOid = record.headRefOid;
  const baseRefName = record.baseRefName;
  const headRefName = record.headRefName;
  const isDraft = record.isDraft;

  if (typeof number !== "number" || !Number.isInteger(number)) return null;
  if (typeof title !== "string") return null;
  if (typeof url !== "string") return null;
  if (typeof headRefOid !== "string") return null;
  if (typeof baseRefName !== "string") return null;
  if (typeof headRefName !== "string") return null;
  if (typeof isDraft !== "boolean") return null;

  const author = record.author && typeof record.author === "object"
    ? { login: parseNonEmptyString((record.author as Record<string, unknown>).login) ?? undefined }
    : undefined;

  return {
    number,
    title,
    url,
    author,
    headRefOid,
    baseRefName,
    headRefName,
    isDraft,
    updatedAt: parseNonEmptyString(record.updatedAt) ?? undefined,
    changedFiles: parseOptionalNumber(record.changedFiles),
    additions: parseOptionalNumber(record.additions),
    deletions: parseOptionalNumber(record.deletions),
  };
}

function parseGitHubReview(value: unknown): GitHubReview | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const user = record.user && typeof record.user === "object"
    ? { login: parseNonEmptyString((record.user as Record<string, unknown>).login) ?? undefined }
    : undefined;

  return {
    id: parseOptionalNumber(record.id),
    html_url: parseNonEmptyString(record.html_url) ?? undefined,
    state: parseNonEmptyString(record.state) ?? undefined,
    commit_id: parseNonEmptyString(record.commit_id) ?? undefined,
    submitted_at: parseNonEmptyString(record.submitted_at) ?? undefined,
    body: parseNonEmptyString(record.body) ?? undefined,
    user,
  };
}

function extractReviewResultMarker(text: string): ReviewResultMarker | null {
  const lines = text.split(/\r?\n/).reverse();
  for (const line of lines) {
    const markerIndex = line.indexOf(REVIEW_RESULT_MARKER);
    if (markerIndex === -1) continue;
    const jsonText = line.slice(markerIndex + REVIEW_RESULT_MARKER.length).trim();
    const value = tryJsonParse(jsonText);
    if (value && typeof value === "object") return value as ReviewResultMarker;
  }
  return null;
}

function extractGitHubReviewUrl(text: string): string | null {
  const match = text.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+#pullrequestreview-\d+/);
  return match?.[0] ?? null;
}

async function emitSkipped(
  ctx: PluginContext,
  repo: RepositoryConfig,
  pr: PullRequest,
  reason: string,
  extra: Record<string, unknown> = {},
) {
  await ctx.emit({
    type: "github-auto-review.review.skipped",
    payload: reviewPayload(repo, pr, { reason, ...extra }),
  });
  await ctx.log("github-auto-review skipped PR", {
    repo: repo.repo,
    pr: pr.number,
    head_sha: pr.headRefOid,
    reason,
    ...extra,
  });
}

function reviewPayload(
  repo: RepositoryConfig,
  pr: PullRequest,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    repo: repo.repo,
    repo_name: repo.name,
    repo_cwd: repo.cwd,
    pr: pr.number,
    title: pr.title,
    url: pr.url,
    head_sha: pr.headRefOid,
    head_ref: pr.headRefName,
    base_ref: pr.baseRefName,
    ...extra,
  };
}

function reviewedKey(repo: string, prNumber: number, headSha: string): string {
  return `reviewed:${repo}:${prNumber}:${headSha}`;
}

function getRepoFilter(payload: unknown): Set<string> | null {
  if (payload === null || typeof payload !== "object") return null;
  const repos = (payload as Record<string, unknown>).repos;
  if (!Array.isArray(repos)) return null;
  const values = repos.filter((repo): repo is string => typeof repo === "string" && repo.length > 0);
  return values.length > 0 ? new Set(values) : null;
}

function getPayloadString(payload: unknown, key: string): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

async function runJson<T>(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<T> {
  const text = await runText(command, args, options);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `failed to parse JSON from ${command} ${args.join(" ")}: ${stringifyError(error)}\n${text}`,
    );
  }
}

async function runText(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<string> {
  const result = await runCommand(command, args, options);
  return result.stdout.trim();
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

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStringArray(value: unknown): string[] | null {
  const parsed = typeof value === "string" ? tryJsonParse(value) : value;
  if (!Array.isArray(parsed)) return null;
  const strings = parsed
    .map(parseNonEmptyString)
    .filter((item): item is string => item !== null);
  return strings.length > 0 ? strings : null;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function pullRequestAgeHours(pr: PullRequest): number | null {
  if (!pr.updatedAt) return null;
  const updatedAtMs = Date.parse(pr.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return null;
  return (Date.now() - updatedAtMs) / 3_600_000;
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function tryJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function splitRepo(repo: string): [string, string] {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`repo must be in OWNER/REPO form: ${repo}`);
  }
  return [parts[0], parts[1]];
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tail(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(text.length - maxLength);
}
