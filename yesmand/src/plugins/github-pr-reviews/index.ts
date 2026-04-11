import { stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { $ } from "bun";
import { z } from "zod";
import type {
  AutomationPlugin,
  DispatchDecision,
  EvaluationResult,
  PluginContext,
  PluginFactory,
  PluginSchedule,
  WorkItem,
} from "../../types";

interface RepoConfig {
  owner: string;
  repo: string;
}

interface PullRequest {
  number: number;
  title: string;
  author: string;
  url: string;
  base: string;
  head: string;
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: string[];
  reviewDecision: string;
  updatedAt: string;
}

interface ReviewWorkItem {
  kind: "review" | "changes";
  slug: string;
  owner: string;
  repo: string;
  pr: PullRequest;
}

const repoSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const configSchema = z.object({
  scheduleEveryMinutes: z.number().int().min(1).default(60),
  runOnStartup: z.boolean().default(true),
  scheduleJitterSeconds: z.number().int().min(0).default(30),
  reviewRepoPath: z.string().default("~/projects/stackpop-reviews"),
  lookbackHours: z.number().int().min(1).default(24),
  repos: z.array(repoSchema).min(1),
});

const workItemMetadataSchema = z.object({
  reviewRepoPath: z.string(),
  item: z.object({
    kind: z.enum(["review", "changes"]),
    slug: z.string(),
    owner: z.string(),
    repo: z.string(),
    pr: z.object({
      number: z.number(),
      title: z.string(),
      author: z.string(),
      url: z.string(),
      base: z.string(),
      head: z.string(),
      body: z.string(),
      additions: z.number(),
      deletions: z.number(),
      changedFiles: z.number(),
      labels: z.array(z.string()),
      reviewDecision: z.string(),
      updatedAt: z.string(),
    }),
  }),
});

type GithubPRReviewsConfig = z.infer<typeof configSchema>;
type WorkItemMetadata = z.infer<typeof workItemMetadataSchema>;

const DEFAULT_CONFIG: GithubPRReviewsConfig = {
  scheduleEveryMinutes: 60,
  runOnStartup: true,
  scheduleJitterSeconds: 30,
  reviewRepoPath: "~/projects/stackpop-reviews",
  lookbackHours: 24,
  repos: [
    {
      owner: "IABTechLab",
      repo: "trusted-server",
    },
    {
      owner: "stackpop",
      repo: "mocktioneer",
    },
    {
      owner: "stackpop",
      repo: "edgezero",
    },
  ],
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

function resolveConfigFromEnv(): GithubPRReviewsConfig {
  return configSchema.parse({
    ...DEFAULT_CONFIG,
    scheduleEveryMinutes:
      readIntEnv("YESMAND_PR_REVIEWS_EVERY_MINUTES") ?? DEFAULT_CONFIG.scheduleEveryMinutes,
    runOnStartup:
      readBoolEnv("YESMAND_PR_REVIEWS_RUN_ON_STARTUP") ?? DEFAULT_CONFIG.runOnStartup,
    scheduleJitterSeconds:
      readIntEnv("YESMAND_PR_REVIEWS_SCHEDULE_JITTER_SECONDS") ??
      DEFAULT_CONFIG.scheduleJitterSeconds,
    reviewRepoPath:
      process.env.YESMAND_PR_REVIEWS_REVIEW_REPO_PATH ?? DEFAULT_CONFIG.reviewRepoPath,
    lookbackHours:
      readIntEnv("YESMAND_PR_REVIEWS_LOOKBACK_HOURS") ?? DEFAULT_CONFIG.lookbackHours,
  });
}

const GH_PR_FIELDS =
  "number,title,url,body,additions,deletions,changedFiles,labels,reviewDecision,updatedAt,author,baseRefName,headRefName";

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

function parsePullRequests(raw: string): PullRequest[] {
  if (!raw.trim()) return [];
  try {
    const items = JSON.parse(raw) as Array<Record<string, unknown>>;
    return items.map((item) => ({
      number: (item.number as number) ?? 0,
      title: (item.title as string) ?? "",
      author: (item.author as { login: string } | undefined)?.login ?? "unknown",
      url: (item.url as string) ?? "",
      base: (item.baseRefName as string) ?? "",
      head: (item.headRefName as string) ?? "",
      body: (item.body as string) ?? "",
      additions: (item.additions as number) ?? 0,
      deletions: (item.deletions as number) ?? 0,
      changedFiles: (item.changedFiles as number) ?? 0,
      labels: ((item.labels as Array<{ name: string }>) ?? []).map((l) => l.name),
      reviewDecision: (item.reviewDecision as string) ?? "",
      updatedAt: (item.updatedAt as string) ?? "",
    }));
  } catch {
    return [];
  }
}

function buildPrompt(item: ReviewWorkItem, reviewRepoPath: string): string {
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const pr = item.pr;
  const reviewFilePath = `reviews/${item.owner}/${item.repo}/pr-${pr.number}.md`;

  const prJson = JSON.stringify(
    {
      kind: item.kind,
      repo: item.slug,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      url: pr.url,
      base: pr.base,
      head: pr.head,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      reviewDecision: pr.reviewDecision,
      updatedAt: pr.updatedAt,
    },
    null,
    2
  );

  return [
    "You are an internal PR review assistant.",
    "",
    "Goal: get a head start on reviews without posting anything publicly.",
    "",
    "## Hard requirements",
    "1. Do NOT post review comments on GitHub.",
    "2. Do NOT approve/reject PRs on GitHub.",
    "3. Write all output to the local internal repo only.",
    "4. After writing files, commit and push to origin/master in that internal repo.",
    "",
    "## Internal review repo",
    `- Path: ${reviewRepoPath}`,
    `- Write/update file: ${reviewFilePath}`,
    "",
    "## PR to review",
    "```json",
    prJson,
    "```",
    "",
    "## Required workflow",
    `1. Fetch context with gh commands for ${item.slug}#${pr.number} (diff, review comments, review state).`,
    `2. Produce or update exactly one markdown file at ${reviewFilePath}.`,
    "3. The file must include sections:",
    "   - Overview",
    "   - Key Findings",
    "   - Suggested Fixes",
    "   - Regressions To Verify",
    "   - Confidence / Unknowns",
    "4. Include source metadata line: `Source Updated At: <updatedAt from PR JSON>`.",
    "5. Keep suggestions concrete and actionable, referencing files/functions when possible.",
    "6. Stage only files in reviews/.",
    "7. If there are staged changes, commit with message:",
    `   chore(reviews): update PR review notes ${date}`,
    "8. Push to origin master.",
    "9. If there are no changes, do not create an empty commit.",
    "",
    "## Output discipline",
    "- Keep markdown concise and useful for future implementation planning.",
    "- This is internal analysis only.",
  ].join("\n");
}

async function fetchReviewQueue(
  config: GithubPRReviewsConfig,
  ctx: PluginContext
): Promise<ReviewWorkItem[]> {
  const queue: ReviewWorkItem[] = [];
  const cutoff = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000).toISOString();

  for (const repo of config.repos) {
    const slug = `${repo.owner}/${repo.repo}`;

    const toReviewRaw =
      await $`gh pr list --repo ${slug} --search "review-requested:@me -reviewed-by:@me" --json ${GH_PR_FIELDS}`
        .text()
        .catch(() => "[]");

    const myPRsRaw =
      await $`gh pr list --repo ${slug} --author @me --json ${GH_PR_FIELDS}`
        .text()
        .catch(() => "[]");

    const toReview = parsePullRequests(toReviewRaw).filter((pr) => pr.updatedAt >= cutoff);
    const myPRs = parsePullRequests(myPRsRaw)
      .filter((pr) => pr.reviewDecision === "CHANGES_REQUESTED")
      .filter((pr) => pr.updatedAt >= cutoff);

    for (const pr of toReview) {
      queue.push({
        kind: "review",
        slug,
        owner: repo.owner,
        repo: repo.repo,
        pr,
      });
    }

    for (const pr of myPRs) {
      queue.push({
        kind: "changes",
        slug,
        owner: repo.owner,
        repo: repo.repo,
        pr,
      });
    }
  }

  ctx.logger.info("Built PR review queue", {
    total: queue.length,
    lookbackHours: config.lookbackHours,
  });

  return queue;
}

class GithubPRReviewsPlugin implements AutomationPlugin {
  readonly id = "github-pr-reviews";
  readonly schedule: PluginSchedule;
  private readonly cfg: GithubPRReviewsConfig;

  constructor(config: GithubPRReviewsConfig) {
    this.cfg = config;
    this.schedule = {
      everyMinutes: config.scheduleEveryMinutes,
      runOnStartup: config.runOnStartup,
      jitterSeconds: config.scheduleJitterSeconds,
    };
  }

  async discoverCandidates(ctx: PluginContext): Promise<WorkItem[]> {
    const queue = await fetchReviewQueue(this.cfg, ctx);
    if (queue.length === 0) return [];

    const reviewRepoPath = expandHome(this.cfg.reviewRepoPath);

    return queue.map((item) => ({
      id: `github-pr-reviews:${item.slug}#${item.pr.number}:${item.kind}`,
      title: `${item.slug}#${item.pr.number} ${item.kind}`,
      body: item.pr.title,
      url: item.pr.url,
      metadata: {
        reviewRepoPath,
        item,
      },
    }));
  }

  async evaluateCandidate(item: WorkItem): Promise<EvaluationResult> {
    const metadata = workItemMetadataSchema.parse(item.metadata) as WorkItemMetadata;

    if (!(await pathExists(metadata.reviewRepoPath))) {
      return {
        kind: "wait",
        reason: `Review repo path not found: ${metadata.reviewRepoPath}`,
      };
    }

    if (!(await pathExists(join(metadata.reviewRepoPath, ".git")))) {
      return {
        kind: "wait",
        reason: `Review repo is not a git repository: ${metadata.reviewRepoPath}`,
      };
    }

    const reviewItem = metadata.item as ReviewWorkItem;
    const prompt = buildPrompt(reviewItem, metadata.reviewRepoPath);

    return {
      kind: "dispatch",
      phase: "implementation",
      dedupeKey: `${item.id}:${reviewItem.pr.updatedAt}`,
      sessionTitle: `Review ${reviewItem.slug}#${reviewItem.pr.number}: ${reviewItem.pr.title}`,
      directory: metadata.reviewRepoPath,
      prompt,
      metadata: {
        slug: reviewItem.slug,
        prNumber: reviewItem.pr.number,
        updatedAt: reviewItem.pr.updatedAt,
        kind: reviewItem.kind,
      },
    };
  }

  async onDispatchSuccess(
    item: WorkItem,
    decision: DispatchDecision,
    sessionId: string,
    ctx: PluginContext
  ): Promise<void> {
    ctx.logger.info("PR review dispatch succeeded", {
      itemId: item.id,
      phase: decision.phase,
      sessionId,
      slug: decision.metadata?.slug,
      prNumber: decision.metadata?.prNumber,
      updatedAt: decision.metadata?.updatedAt,
    });
  }
}

export const createPlugin: PluginFactory = async () => {
  return new GithubPRReviewsPlugin(resolveConfigFromEnv());
};
