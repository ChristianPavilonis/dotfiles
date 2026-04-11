import { mkdir, stat } from "node:fs/promises";
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
  localPath: string;
  defaultBranch: string;
}

interface Issue {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
  author: string;
  createdAt: string;
}

interface IssueComment {
  id: number;
  body: string;
}

interface IssueReaction {
  content: string;
  user: {
    login: string;
  };
}

const repoSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  localPath: z.string().min(1),
  defaultBranch: z.string().min(1).default("master"),
});

const configSchema = z.object({
  scheduleEveryMinutes: z.number().int().min(1).default(5),
  runOnStartup: z.boolean().default(true),
  scheduleJitterSeconds: z.number().int().min(0).default(15),
  triggerToken: z.string().default("@yesman"),
  planToken: z.string().default("#plan"),
  workingLabel: z.string().default("agent-working"),
  doneLabel: z.string().default("agent-pr-created"),
  planMarker: z.string().default("<!-- yesman-plan:v1 -->"),
  implementationDispatchMarker: z
    .string()
    .default("<!-- yesman-implementation-dispatched:v1 -->"),
  approverLogin: z.string().min(1),
  worktreeRoot: z.string().default("~/worktrees"),
  repos: z.array(repoSchema).min(1),
});

const metadataSchema = z.object({
  repo: repoSchema,
  issueNumber: z.number(),
  labels: z.array(z.string()),
  author: z.string(),
});

type WorkItemMetadata = z.infer<typeof metadataSchema>;

type GithubPluginConfig = z.infer<typeof configSchema>;

const DEFAULT_CONFIG: GithubPluginConfig = {
  scheduleEveryMinutes: 5,
  runOnStartup: true,
  scheduleJitterSeconds: 15,
  triggerToken: "@yesman",
  planToken: "#plan",
  workingLabel: "agent-working",
  doneLabel: "agent-pr-created",
  planMarker: "<!-- yesman-plan:v1 -->",
  implementationDispatchMarker: "<!-- yesman-implementation-dispatched:v1 -->",
  approverLogin: "ChristianPavilonis",
  worktreeRoot: "~/worktrees",
  repos: [
    {
      owner: "ChristianPavilonis",
      repo: "rigzilla",
      localPath: "~/projects/rigzilla",
      defaultBranch: "master",
    },
    {
      owner: "ChristianPavilonis",
      repo: "rigzilla-scraper",
      localPath: "~/projects/scrapezilla",
      defaultBranch: "master",
    },
    {
      owner: "ChristianPavilonis",
      repo: "dotfiles",
      localPath: "~/dotfiles",
      defaultBranch: "master",
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

function resolveConfigFromEnv(): GithubPluginConfig {
  return configSchema.parse({
    ...DEFAULT_CONFIG,
    scheduleEveryMinutes:
      readIntEnv("YESMAND_GITHUB_EVERY_MINUTES") ?? DEFAULT_CONFIG.scheduleEveryMinutes,
    runOnStartup: readBoolEnv("YESMAND_GITHUB_RUN_ON_STARTUP") ?? DEFAULT_CONFIG.runOnStartup,
    scheduleJitterSeconds:
      readIntEnv("YESMAND_GITHUB_SCHEDULE_JITTER_SECONDS") ??
      DEFAULT_CONFIG.scheduleJitterSeconds,
    approverLogin:
      process.env.YESMAND_GITHUB_APPROVER_LOGIN ?? DEFAULT_CONFIG.approverLogin,
    worktreeRoot: process.env.YESMAND_GITHUB_WORKTREE_ROOT ?? DEFAULT_CONFIG.worktreeRoot,
  });
}

function expandHome(input: string): string {
  return input.startsWith("~/") ? join(homedir(), input.slice(2)) : input;
}

function slug(repo: RepoConfig): string {
  return `${repo.owner}/${repo.repo}`;
}

function parseIssues(raw: string): Issue[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    return parsed.map((item) => ({
      number: item.number as number,
      title: (item.title as string) ?? "",
      body: (item.body as string) ?? "",
      url: (item.url as string) ?? "",
      labels: ((item.labels as Array<{ name: string }>) ?? []).map((label) => label.name),
      author: (item.author as { login: string } | undefined)?.login ?? "unknown",
      createdAt: (item.createdAt as string) ?? "",
    }));
  } catch {
    return [];
  }
}

function hasToken(text: string, token: string): boolean {
  return text.toLowerCase().includes(token.toLowerCase());
}

function latestCommentWithMarker(
  comments: IssueComment[],
  marker: string
): IssueComment | undefined {
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].body.includes(marker)) return comments[i];
  }
  return undefined;
}

function hasCommentMarker(comments: IssueComment[], marker: string): boolean {
  return comments.some((comment) => comment.body.includes(marker));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureLabel(
  issueSlug: string,
  name: string,
  color: string,
  description: string,
  dryRun: boolean,
  logger: PluginContext["logger"]
): Promise<void> {
  const raw = await $`gh label list --repo ${issueSlug} --search ${name} --json name`
    .text()
    .catch(() => "[]");

  const labels = JSON.parse(raw || "[]") as Array<{ name: string }>;
  const exists = labels.some((label) => label.name.toLowerCase() === name.toLowerCase());
  if (exists) return;

  if (dryRun) {
    logger.info("Would create missing label", { issueSlug, label: name });
    return;
  }

  await $`gh label create ${name} --repo ${issueSlug} --color ${color} --description ${description} --force`;
  logger.info("Created missing label", { issueSlug, label: name });
}

async function addLabel(
  issueSlug: string,
  issueNumber: number,
  label: string,
  dryRun: boolean,
  logger: PluginContext["logger"]
): Promise<void> {
  if (dryRun) {
    logger.info("Would add label", { issueSlug, issueNumber, label });
    return;
  }
  await $`gh issue edit ${String(issueNumber)} --repo ${issueSlug} --add-label ${label}`;
}

async function addComment(
  issueSlug: string,
  issueNumber: number,
  body: string,
  dryRun: boolean,
  logger: PluginContext["logger"]
): Promise<void> {
  if (dryRun) {
    logger.info("Would add comment", { issueSlug, issueNumber, body });
    return;
  }

  await $`gh issue comment ${String(issueNumber)} --repo ${issueSlug} --body ${body}`;
}

async function fetchIssueComments(
  issueSlug: string,
  issueNumber: number
): Promise<IssueComment[]> {
  const raw = await $`gh api repos/${issueSlug}/issues/${String(issueNumber)}/comments?per_page=100`
    .text()
    .catch(() => "[]");

  try {
    const parsed = JSON.parse(raw) as Array<{ id: number; body: string }>;
    return parsed.map((item) => ({ id: item.id, body: item.body ?? "" }));
  } catch {
    return [];
  }
}

async function hasApprovalReaction(
  issueSlug: string,
  commentId: number,
  approverLogin: string
): Promise<boolean> {
  const raw = await $`gh api repos/${issueSlug}/issues/comments/${String(commentId)}/reactions?per_page=100`
    .text()
    .catch(() => "[]");

  try {
    const parsed = JSON.parse(raw) as IssueReaction[];
    return parsed.some(
      (reaction) =>
        reaction.content === "+1" && reaction.user?.login === approverLogin
    );
  } catch {
    return false;
  }
}

async function ensureWorktree(
  repo: RepoConfig,
  issueNumber: number,
  worktreeRoot: string,
  dryRun: boolean,
  logger: PluginContext["logger"]
): Promise<{ worktreePath: string; branchName: string }> {
  const root = expandHome(worktreeRoot);
  const localPath = expandHome(repo.localPath);
  const branchName = `agent/issue-${issueNumber}`;
  const worktreePath = join(root, `${repo.repo}-issue-${issueNumber}`);

  if (dryRun) {
    logger.info("Would ensure worktree", {
      localPath,
      worktreePath,
      branchName,
      repo: slug(repo),
    });
    return { worktreePath, branchName };
  }

  await mkdir(root, { recursive: true });
  await $`git -C ${localPath} fetch origin`;

  if (await pathExists(worktreePath)) {
    return { worktreePath, branchName };
  }

  const branchCheck = await $`git -C ${localPath} rev-parse --verify ${branchName}`
    .quiet()
    .nothrow();

  if (branchCheck.exitCode === 0) {
    await $`git -C ${localPath} worktree add ${worktreePath} ${branchName}`;
  } else {
    await $`git -C ${localPath} worktree add -b ${branchName} ${worktreePath} origin/${repo.defaultBranch}`;
  }

  return { worktreePath, branchName };
}

function buildPlanPrompt(
  issueSlug: string,
  issue: Issue,
  issueLabels: string[],
  issueAuthor: string,
  issueBody: string,
  issueNumber: number,
  planMarker: string,
  branchName: string
): string {
  return [
    `You are preparing an implementation plan for GitHub issue #${issueNumber} in ${issueSlug}.`,
    "",
    "## Issue Details",
    `- Title: ${issue.title}`,
    `- Author: @${issueAuthor}`,
    `- URL: ${issue.url}`,
    `- Labels: ${issueLabels.join(", ")}`,
    "",
    "## Issue Body",
    issueBody || "(no description provided)",
    "",
    "## Instructions",
    "1. Deeply explore the repository before proposing a plan.",
    "2. Read all relevant implementation files, nearby modules, and tests/docs to understand existing patterns and constraints.",
    "3. Produce a concrete implementation plan with ordered steps and explicit file/module targets.",
    "4. Include validation strategy, edge cases, and top risks in the plan.",
    "5. Post that plan as an issue comment with this exact marker on the first line:",
    `   ${planMarker}`,
    "6. End the comment with: React with :+1: to this comment to approve implementation.",
    "7. You MUST execute the gh command to post the comment, then stop.",
    "8. Do NOT modify code, commit, push, or create a PR in this phase.",
    "",
    "## Important",
    `- Use command: gh issue comment ${issueNumber} --repo ${issueSlug} --body \"${planMarker}\\n\\n## Plan for #${issueNumber}\\n...\"`,
    "- If your first gh issue comment command fails, retry once with corrected quoting.",
    `- You are on branch ${branchName}; use this worktree context to investigate the codebase thoroughly before posting the plan.`,
  ].join("\n");
}

function buildImplementationPrompt(
  issueSlug: string,
  issue: Issue,
  issueLabels: string[],
  issueAuthor: string,
  issueBody: string,
  issueNumber: number,
  defaultBranch: string,
  branchName: string,
  approvedPlan?: string,
  approverLogin?: string
): string {
  const normalizedPlan = approvedPlan
    ?.replace("React with :+1: to this comment to approve implementation.", "")
    .trim();

  const approvedSection = normalizedPlan
    ? [
        "## Approved Plan",
        normalizedPlan,
        "",
        `Plan approval was provided by @${approverLogin}. Follow this approved plan.`,
        "",
      ]
    : [];

  return [
    `You are resolving GitHub issue #${issueNumber} in ${issueSlug}.`,
    "",
    "## Issue Details",
    `- Title: ${issue.title}`,
    `- Author: @${issueAuthor}`,
    `- URL: ${issue.url}`,
    `- Labels: ${issueLabels.join(", ")}`,
    "",
    "## Issue Body",
    issueBody || "(no description provided)",
    "",
    ...approvedSection,
    "## Instructions",
    "1. Read and understand the issue thoroughly.",
    "2. Explore the codebase and implement the fix.",
    "3. Validate correctness (tests/build where appropriate).",
    `4. Commit your changes with message referencing #${issueNumber}.`,
    `5. Push branch: git push -u origin ${branchName}`,
    "6. Create PR:",
    `   gh pr create --repo ${issueSlug} --base ${defaultBranch} --head ${branchName} --title \"<title>\" --body \"Resolves #${issueNumber}\\n\\n<summary>\"`,
    `7. Comment on issue with PR URL: gh issue comment ${issueNumber} --repo ${issueSlug} --body \"Created PR: <pr-url>\"`,
    "",
    "## Important",
    "- If not fully resolved, create a draft PR with clear next steps.",
    "- Do not modify CI/CD or workflows unless issue explicitly asks for it.",
  ].join("\n");
}

class GithubYesmanPlugin implements AutomationPlugin {
  readonly id = "github-yesman";
  readonly schedule: PluginSchedule;
  private readonly cfg: GithubPluginConfig;
  private readonly labelsEnsured = new Set<string>();

  constructor(config: GithubPluginConfig) {
    this.cfg = config;
    this.schedule = {
      everyMinutes: config.scheduleEveryMinutes,
      runOnStartup: config.runOnStartup,
      jitterSeconds: config.scheduleJitterSeconds,
    };
  }

  async discoverCandidates(ctx: PluginContext): Promise<WorkItem[]> {
    const items: WorkItem[] = [];

    for (const repo of this.cfg.repos) {
      const issueSlug = slug(repo);
      if (!this.labelsEnsured.has(issueSlug)) {
        await ensureLabel(
          issueSlug,
          this.cfg.workingLabel,
          "fbca04",
          "AI agent is working on this issue",
          ctx.dryRun,
          ctx.logger
        );
        await ensureLabel(
          issueSlug,
          this.cfg.doneLabel,
          "0e8a16",
          "AI agent created a PR for this issue",
          ctx.dryRun,
          ctx.logger
        );
        this.labelsEnsured.add(issueSlug);
      }

      const raw = await $`gh issue list --repo ${issueSlug} --state open --limit 200 --json number,title,body,url,labels,createdAt,author`
        .text()
        .catch(() => "[]");

      const issues = parseIssues(raw);

      for (const issue of issues) {
        if (!hasToken(issue.body, this.cfg.triggerToken)) continue;
        if (issue.labels.includes(this.cfg.doneLabel)) continue;

        const item: WorkItem = {
          id: `${issueSlug}#${issue.number}`,
          title: issue.title,
          body: issue.body,
          url: issue.url,
          createdAt: issue.createdAt,
          metadata: {
            repo,
            issueNumber: issue.number,
            labels: issue.labels,
            author: issue.author,
          } satisfies WorkItemMetadata,
        };
        items.push(item);
      }
    }

    return items;
  }

  async evaluateCandidate(item: WorkItem, ctx: PluginContext): Promise<EvaluationResult> {
    const metadata = metadataSchema.parse(item.metadata);
    const repo = metadata.repo;
    const issueNumber = metadata.issueNumber;
    const issueSlug = slug(repo);
    const issue: Issue = {
      number: issueNumber,
      title: item.title,
      body: item.body,
      url: item.url,
      labels: metadata.labels,
      author: metadata.author,
      createdAt: item.createdAt ?? "",
    };

    const isWorking = issue.labels.includes(this.cfg.workingLabel);
    const wantsPlan = hasToken(issue.body, this.cfg.planToken);
    const planDedupeKey = `${item.id}:plan:v1`;

    if (!isWorking) {
      await addLabel(issueSlug, issueNumber, this.cfg.workingLabel, ctx.dryRun, ctx.logger);
    } else if (!wantsPlan) {
      // Non-plan issues already have lock label. Let dedupe key prevent duplicates.
    }

    if (wantsPlan && isWorking) {
      const comments = await fetchIssueComments(issueSlug, issueNumber);
      const planComment = latestCommentWithMarker(comments, this.cfg.planMarker);

      if (!planComment) {
        return { kind: "wait", reason: "Waiting for plan comment to be posted" };
      }

      if (hasCommentMarker(comments, this.cfg.implementationDispatchMarker)) {
        return { kind: "skip", reason: "Implementation already dispatched after approval" };
      }

      const approved = await hasApprovalReaction(
        issueSlug,
        planComment.id,
        this.cfg.approverLogin
      );

      if (!approved) {
        return {
          kind: "wait",
          reason: `Waiting for :+1: approval from @${this.cfg.approverLogin}`,
        };
      }

      const { worktreePath, branchName } = await ensureWorktree(
        repo,
        issue.number,
        this.cfg.worktreeRoot,
        ctx.dryRun,
        ctx.logger
      );

      const prompt = buildImplementationPrompt(
        issueSlug,
        issue,
        issue.labels,
        issue.author,
        issue.body,
        issue.number,
        repo.defaultBranch,
        branchName,
        planComment.body,
        this.cfg.approverLogin
      );

      return {
        kind: "dispatch",
        phase: "implementation",
        dedupeKey: `${item.id}:implementation:plan-comment:${planComment.id}`,
        sessionTitle: `Resolve ${item.id}: ${item.title}`,
        directory: worktreePath,
        prompt,
        continueFromDedupeKey: planDedupeKey,
        metadata: {
          issueSlug,
          issueNumber,
          addImplementationMarker: true,
        },
      };
    }

    const { worktreePath, branchName } = await ensureWorktree(
      repo,
      issue.number,
      this.cfg.worktreeRoot,
      ctx.dryRun,
      ctx.logger
    );

    if (wantsPlan) {
      const prompt = buildPlanPrompt(
        issueSlug,
        issue,
        issue.labels,
        issue.author,
        issue.body,
        issue.number,
        this.cfg.planMarker,
        branchName
      );

      return {
        kind: "dispatch",
        phase: "plan",
        dedupeKey: planDedupeKey,
        sessionTitle: `Plan ${item.id}: ${item.title}`,
        directory: worktreePath,
        prompt,
      };
    }

    const prompt = buildImplementationPrompt(
      issueSlug,
      issue,
      issue.labels,
      issue.author,
      issue.body,
      issue.number,
      repo.defaultBranch,
      branchName
    );

    return {
      kind: "dispatch",
      phase: "implementation",
      dedupeKey: `${item.id}:implementation:v1`,
      sessionTitle: `Resolve ${item.id}: ${item.title}`,
      directory: worktreePath,
      prompt,
    };
  }

  async onDispatchSuccess(
    item: WorkItem,
    decision: DispatchDecision,
    sessionId: string,
    ctx: PluginContext
  ): Promise<void> {
    if (decision.phase !== "implementation") return;

    const metadata = decision.metadata ?? {};
    if (!metadata.addImplementationMarker) return;

    const issueSlug = String(metadata.issueSlug ?? "");
    const issueNumber = Number(metadata.issueNumber ?? 0);
    if (!issueSlug || !issueNumber) {
      ctx.logger.warn("Missing metadata for implementation marker comment", {
        itemId: item.id,
      });
      return;
    }

    const body = `${this.cfg.implementationDispatchMarker}\n\nPlan approved by @${this.cfg.approverLogin}. Implementation session dispatched: ${sessionId}`;
    await addComment(issueSlug, issueNumber, body, ctx.dryRun, ctx.logger);
  }
}

export const createPlugin: PluginFactory = async () => {
  return new GithubYesmanPlugin(resolveConfigFromEnv());
};
