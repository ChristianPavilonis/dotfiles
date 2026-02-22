#!/usr/bin/env bun
/**
 * Issue Resolver
 *
 * Polls configured GitHub repos for issues whose body contains `@yesman`,
 * creates git worktrees, and spawns OpenCode agent sessions.
 *
 * Optional planning gate:
 * - If issue body also contains `#plan`, the first session only drafts a plan
 *   and posts it as an issue comment.
 * - After @ChristianPavilonis reacts with 👍 on that plan comment, a follow-up
 *   implementation session is spawned to execute the plan and create a PR.
 *
 * Usage:
 *   bun run issue-resolver.ts [--no-agents] [--dry-run]
 *
 * Flags:
 *   --no-agents  Skip spawning OpenCode agent sessions (still labels + worktrees)
 *   --dry-run    Print what would be done without modifying anything
 */

import { $ } from "bun";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Repos to watch for @yesman issues. */
const REPOS: RepoConfig[] = [
  {
    owner: "ChristianPavilonis",
    repo: "rigzilla",
    localPath: "~/projects/rigzilla",
    project: "rigzilla",
    defaultBranch: "master",
  },
  {
    owner: "ChristianPavilonis",
    repo: "rigzilla-scraper",
    localPath: "~/projects/scrapezilla",
    project: "scrapezilla",
    defaultBranch: "master",
  },
];

/** Label applied while the agent is working. */
const WORKING_LABEL = "agent-working";
/** Label applied after a PR has been created. */
const DONE_LABEL = "agent-pr-created";

/** Trigger token in issue body. */
const TRIGGER_TOKEN = "@yesman";
/** Optional planning gate token in issue body. */
const PLAN_TOKEN = "#plan";
/** Hidden marker used in plan comment posted by the planning session. */
const PLAN_MARKER = "<!-- yesman-plan:v1 -->";
/** Hidden marker used when implementation session is dispatched after approval. */
const IMPLEMENTATION_DISPATCH_MARKER =
  "<!-- yesman-implementation-dispatched:v1 -->";
/** Only this user can approve plan execution via 👍. */
const PLAN_APPROVER_LOGIN = "ChristianPavilonis";

const WORKTREE_ROOT = expandHome("~/worktrees");
const VAULT_PATH = expandHome("~/Documents/MyObsidianVault");
const DAILY_DIR = join(VAULT_PATH, "daily");
const OPENCODE_URL = "http://0.0.0.0:4096";
const OPENCODE_ENV_FILE = expandHome("~/.config/opencode/.env");
const OPENCODE_USER = "opencode";

/** Model to use for agent sessions. */
const AGENT_MODEL = "openai/gpt-5.3-codex";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepoConfig {
  owner: string;
  repo: string;
  localPath: string;
  project: string;
  defaultBranch: string;
}

interface Issue {
  number: number;
  title: string;
  body: string;
  author: string;
  url: string;
  labels: string[];
  createdAt: string;
}

interface ProcessedIssue {
  config: RepoConfig;
  issue: Issue;
  worktreePath: string;
  branchName: string;
  sessionId?: string;
  error?: string;
  mode?: "plan" | "implementation";
}

interface IssueComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
}

interface IssueReaction {
  content: string;
  user: { login: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function today(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function now(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function log(msg: string): void {
  console.log(`[issue-resolver] ${msg}`);
}

function logError(msg: string): void {
  console.error(`[issue-resolver] ERROR: ${msg}`);
}

function parseModelSpec(model: string): { providerID: string; modelID: string } | undefined {
  const [providerID, ...modelRest] = model.split("/");
  const modelID = modelRest.join("/");
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

async function responseBodySnippet(resp: Response, maxLen = 800): Promise<string> {
  try {
    const body = (await resp.text()).trim();
    if (!body) return "(empty response body)";
    return body.length > maxLen ? `${body.slice(0, maxLen)}...` : body;
  } catch {
    return "(unable to read response body)";
  }
}

function hasToken(text: string | undefined, token: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(token.toLowerCase());
}

function issueTriggered(issue: Issue): boolean {
  return hasToken(issue.body, TRIGGER_TOKEN);
}

function issueRequestsPlan(issue: Issue): boolean {
  return hasToken(issue.body, PLAN_TOKEN);
}

function latestCommentWithMarker(
  comments: IssueComment[],
  marker: string
): IssueComment | undefined {
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].body.includes(marker)) {
      return comments[i];
    }
  }
  return undefined;
}

function hasCommentMarker(comments: IssueComment[], marker: string): boolean {
  return comments.some((comment) => comment.body.includes(marker));
}

async function loadOpenCodePassword(): Promise<string | undefined> {
  try {
    const raw = await readFile(OPENCODE_ENV_FILE, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed) continue;
      const match = trimmed.match(/^OPENCODE_SERVER_PASSWORD=(.+)$/);
      if (match) return match[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    // env file not found or unreadable
  }
  return process.env.OPENCODE_SERVER_PASSWORD;
}

function openCodeHeaders(password: string): Record<string, string> {
  const encoded = btoa(`${OPENCODE_USER}:${password}`);
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${encoded}`,
  };
}

// ---------------------------------------------------------------------------
// Label management
// ---------------------------------------------------------------------------

/**
 * Ensure a label exists on a repo. Creates it if missing.
 */
async function ensureLabel(
  slug: string,
  name: string,
  color: string,
  description: string,
  dryRun: boolean
): Promise<void> {
  const check =
    await $`gh label list --repo ${slug} --search ${name} --json name`
      .text()
      .catch(() => "[]");

  const labels = JSON.parse(check.trim() || "[]") as Array<{ name: string }>;
  const exists = labels.some(
    (l) => l.name.toLowerCase() === name.toLowerCase()
  );

  if (!exists) {
    if (dryRun) {
      log(`Would create label '${name}' on ${slug}`);
    } else {
      await $`gh label create ${name} --repo ${slug} --color ${color} --description ${description} --force`;
      log(`Created label '${name}' on ${slug}`);
    }
  }
}

async function ensureAllLabels(dryRun: boolean): Promise<void> {
  for (const config of REPOS) {
    const slug = `${config.owner}/${config.repo}`;
    await ensureLabel(slug, WORKING_LABEL, "fbca04", "AI agent is working on this issue", dryRun);
    await ensureLabel(slug, DONE_LABEL, "0e8a16", "AI agent created a PR for this issue", dryRun);
  }
}

async function addLabel(slug: string, issueNumber: number, label: string): Promise<void> {
  await $`gh issue edit ${String(issueNumber)} --repo ${slug} --add-label ${label}`;
}

async function removeLabel(slug: string, issueNumber: number, label: string): Promise<void> {
  await $`gh issue edit ${String(issueNumber)} --repo ${slug} --remove-label ${label}`.quiet().nothrow();
}

// ---------------------------------------------------------------------------
// Issue fetching
// ---------------------------------------------------------------------------

const GH_ISSUE_FIELDS = "number,title,body,url,labels,createdAt,author";

function parseGhIssues(raw: string): Issue[] {
  if (!raw.trim()) return [];
  try {
    const items = JSON.parse(raw) as Array<Record<string, unknown>>;
    return items.map((item) => ({
      number: item.number as number,
      title: item.title as string,
      body: (item.body as string) ?? "",
      author: (item.author as { login: string })?.login ?? "unknown",
      url: item.url as string,
      labels: ((item.labels as Array<{ name: string }>) ?? []).map((l) => l.name),
      createdAt: (item.createdAt as string) ?? "",
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch open issues whose body contains @yesman and are not completed.
 *
 * Includes both:
 * - newly triggered issues (no working label yet)
 * - in-flight #plan issues (have working label, waiting for approval)
 */
async function fetchCandidateIssues(config: RepoConfig): Promise<Issue[]> {
  const slug = `${config.owner}/${config.repo}`;

  const raw =
    await $`gh issue list --repo ${slug} --state open --limit 200 --json ${GH_ISSUE_FIELDS}`
      .text()
      .catch(() => "[]");

  const allIssues = parseGhIssues(raw);

  // Keep only @yesman requests that are not already marked done.
  return allIssues.filter(
    (issue) => issueTriggered(issue) && !issue.labels.includes(DONE_LABEL)
  );
}

async function fetchIssueComments(
  slug: string,
  issueNumber: number
): Promise<IssueComment[]> {
  const raw =
    await $`gh api repos/${slug}/issues/${String(issueNumber)}/comments?per_page=100`
      .text()
      .catch(() => "[]");

  try {
    const parsed = JSON.parse(raw) as IssueComment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function hasPlanApprovalReaction(
  slug: string,
  commentId: number,
  approverLogin: string
): Promise<boolean> {
  const raw =
    await $`gh api repos/${slug}/issues/comments/${String(commentId)}/reactions?per_page=100`
      .text()
      .catch(() => "[]");

  try {
    const reactions = JSON.parse(raw) as IssueReaction[];
    return reactions.some(
      (reaction) =>
        reaction.content === "+1" && reaction.user?.login === approverLogin
    );
  } catch {
    return false;
  }
}

async function addIssueComment(
  slug: string,
  issueNumber: number,
  body: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    log(`Would comment on ${slug}#${issueNumber}: ${body}`);
    return;
  }
  await $`gh issue comment ${String(issueNumber)} --repo ${slug} --body ${body}`;
}

// ---------------------------------------------------------------------------
// Git worktree management
// ---------------------------------------------------------------------------

async function createWorktree(
  config: RepoConfig,
  issue: Issue,
  dryRun: boolean
): Promise<{ worktreePath: string; branchName: string }> {
  const localPath = expandHome(config.localPath);
  const branchName = `agent/issue-${issue.number}`;
  const worktreeDir = `${config.repo}-issue-${issue.number}`;
  const worktreePath = join(WORKTREE_ROOT, worktreeDir);

  if (dryRun) {
    log(`Would create worktree at ${worktreePath} (branch: ${branchName})`);
    return { worktreePath, branchName };
  }

  // Ensure worktree root exists
  await mkdir(WORKTREE_ROOT, { recursive: true });

  // Fetch latest from origin
  log(`Fetching latest from origin in ${localPath}...`);
  await $`git -C ${localPath} fetch origin`;

  // Check if worktree already exists
  if (await fileExists(worktreePath)) {
    log(`Worktree already exists at ${worktreePath}, reusing`);
    return { worktreePath, branchName };
  }

  // Check if branch already exists
  const branchCheck =
    await $`git -C ${localPath} rev-parse --verify ${branchName}`
      .quiet()
      .nothrow();

  if (branchCheck.exitCode === 0) {
    // Branch exists, create worktree from it
    await $`git -C ${localPath} worktree add ${worktreePath} ${branchName}`;
  } else {
    // Create new branch from origin/defaultBranch
    await $`git -C ${localPath} worktree add -b ${branchName} ${worktreePath} origin/${config.defaultBranch}`;
  }

  log(`Created worktree at ${worktreePath} (branch: ${branchName})`);
  return { worktreePath, branchName };
}

// ---------------------------------------------------------------------------
// OpenCode agent sessions
// ---------------------------------------------------------------------------

async function isOpenCodeRunning(password?: string): Promise<boolean> {
  try {
    const headers = password ? openCodeHeaders(password) : {};
    const resp = await fetch(`${OPENCODE_URL}/global/health`, { headers });
    return resp.ok;
  } catch {
    return false;
  }
}

function buildPlanPrompt(config: RepoConfig, issue: Issue, branchName: string): string {
  const slug = `${config.owner}/${config.repo}`;

  return [
    `You are preparing an implementation plan for GitHub issue #${issue.number} in ${slug}.`,
    "",
    `## Issue Details`,
    `- **Title**: ${issue.title}`,
    `- **Author**: @${issue.author}`,
    `- **URL**: ${issue.url}`,
    `- **Labels**: ${issue.labels.join(", ")}`,
    "",
    `## Issue Body`,
    "",
    issue.body || "(no description provided)",
    "",
    `## Instructions`,
    "",
    "1. Read and understand the issue thoroughly.",
    "2. Explore the codebase and identify the root cause and affected files.",
    "3. Write a concrete implementation plan with clear ordered steps.",
    "4. Post the plan as an issue comment using this exact marker at the top:",
    `   ${PLAN_MARKER}`,
    "5. End your comment with: 'React with 👍 to this comment to approve implementation.'",
    "6. Do NOT implement code yet. Do NOT commit, push, or create a PR in this planning phase.",
    "",
    "## Important",
    "",
    `- Use: \`gh issue comment ${issue.number} --repo ${slug} --body "${PLAN_MARKER}\n\n## Plan for #${issue.number}\n..."\``,
    `- You are on branch \`${branchName}\` for prep, but this phase is planning only.`,
  ].join("\n");
}

function buildImplementationPrompt(
  config: RepoConfig,
  issue: Issue,
  branchName: string,
  approvedPlan?: string
): string {
  const slug = `${config.owner}/${config.repo}`;
  const normalizedPlan = approvedPlan
    ?.replace(PLAN_MARKER, "")
    .replace(/React with 👍 to this comment to approve implementation\.?/gi, "")
    .trim();

  return [
    `You are resolving GitHub issue #${issue.number} in ${slug}.`,
    "",
    `## Issue Details`,
    `- **Title**: ${issue.title}`,
    `- **Author**: @${issue.author}`,
    `- **URL**: ${issue.url}`,
    `- **Labels**: ${issue.labels.join(", ")}`,
    "",
    `## Issue Body`,
    "",
    issue.body || "(no description provided)",
    "",
    ...(normalizedPlan
      ? [
          "## Approved Plan",
          normalizedPlan,
          "",
          `- The plan has been approved by @${PLAN_APPROVER_LOGIN}. Execute this plan.`,
          "",
        ]
      : []),
    `## Instructions`,
    "",
    "1. Read and understand the issue thoroughly.",
    "2. Explore the codebase to understand the relevant code and architecture.",
    "3. Implement a fix or feature that addresses the issue.",
    "4. Make sure your changes are correct — check for compilation/type errors if applicable.",
    "5. Commit your changes with a descriptive message that references the issue:",
    `   \`git commit -m "fix: <description> (resolves #${issue.number})"\``,
    `6. Push the branch: \`git push -u origin ${branchName}\``,
    `7. Create a pull request:`,
    "   ```",
    `   gh pr create --repo ${slug} --base ${config.defaultBranch} --head ${branchName} --title "<descriptive title>" --body "Resolves #${issue.number}`,
    "",
    `   <summary of changes>"`,
    "   ```",
    `8. Comment on the issue with a link to the PR:`,
    `   \`gh issue comment ${issue.number} --repo ${slug} --body "Created PR: <pr-url>"\``,
    "",
    "## Important",
    "",
    "- If you cannot fully resolve the issue, push whatever progress you have and create a **draft** PR instead:",
    `  \`gh pr create --repo ${slug} --base ${config.defaultBranch} --head ${branchName} --draft --title "WIP: <title>" --body "Partial progress on #${issue.number}\\n\\n<what was done and what remains>"\``,
    "- Always push your branch and create a PR (regular or draft), even if incomplete.",
    "- Do NOT modify any CI/CD configuration or GitHub Actions workflows unless the issue specifically asks for it.",
  ].join("\n");
}

async function spawnAgentSession(
  config: RepoConfig,
  issue: Issue,
  worktreePath: string,
  branchName: string,
  mode: "plan" | "implementation",
  approvedPlan: string | undefined,
  password?: string
): Promise<string | undefined> {
  const slug = `${config.owner}/${config.repo}`;
  const dirParam = encodeURIComponent(worktreePath);
  const headers = password
    ? openCodeHeaders(password)
    : { "Content-Type": "application/json" };

  // Create session
  const sessionResp = await fetch(
    `${OPENCODE_URL}/session?directory=${dirParam}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title:
          mode === "plan"
            ? `Plan ${slug}#${issue.number}: ${issue.title}`
            : `Resolve ${slug}#${issue.number}: ${issue.title}`,
      }),
    }
  );

  if (!sessionResp.ok) {
    const body = await responseBodySnippet(sessionResp);
    logError(
      `Failed to create session for ${slug}#${issue.number}: ${sessionResp.status} ${sessionResp.statusText} -- ${body}`
    );
    return undefined;
  }

  const session = (await sessionResp.json()) as { id: string };

  // Build and send prompt
  const prompt =
    mode === "plan"
      ? buildPlanPrompt(config, issue, branchName)
      : buildImplementationPrompt(config, issue, branchName, approvedPlan);
  const modelSpec = parseModelSpec(AGENT_MODEL);

  if (!modelSpec) {
    logError(`Invalid AGENT_MODEL format '${AGENT_MODEL}' (expected provider/model)`);
    return undefined;
  }

  const promptResp = await fetch(
    `${OPENCODE_URL}/session/${session.id}/prompt_async?directory=${dirParam}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelSpec,
        parts: [{ type: "text", text: prompt }],
      }),
    }
  );

  if (promptResp.ok) {
    log(
      `Spawned ${mode} session for ${slug}#${issue.number} (session: ${session.id}, model: ${AGENT_MODEL})`
    );
    return session.id;
  } else {
    const body = await responseBodySnippet(promptResp);
    logError(
      `Failed to send prompt for ${slug}#${issue.number}: ${promptResp.status} ${promptResp.statusText} (model: ${AGENT_MODEL}) -- ${body}`
    );
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Daily note integration
// ---------------------------------------------------------------------------

async function ensureDailyNote(date: string): Promise<string> {
  const filePath = join(DAILY_DIR, `${date}.md`);
  if (await fileExists(filePath)) {
    return filePath;
  }

  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);

  function fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  const content = `
## Notes




## today's log




<< [[${fmt(yesterday)}]] | [[${fmt(tomorrow)}]] >>
`;

  await mkdir(DAILY_DIR, { recursive: true });
  await writeFile(filePath, content.trimStart(), "utf-8");
  return filePath;
}

function buildDailyNoteSection(processed: ProcessedIssue[]): string {
  const lines: string[] = [];
  lines.push("### Issue Resolver");
  lines.push(`*Run at ${now()}*`);
  lines.push("");

  if (processed.length === 0) {
    lines.push("No @yesman issues needed dispatch this run.");
    return lines.join("\n");
  }

  lines.push(`**${processed.length} issue(s) dispatched to agent:**`);
  for (const p of processed) {
    const slug = `${p.config.owner}/${p.config.repo}`;
    const status = p.error
      ? `-- error: ${p.error}`
      : p.sessionId
        ? `-- ${p.mode ?? "implementation"} session: \`${p.sessionId.slice(0, 8)}...\``
        : "-- worktree created";
    lines.push(
      `- [${slug}#${p.issue.number}](${p.issue.url}) - ${p.issue.title} ${status}`
    );
  }
  lines.push("");

  return lines.join("\n");
}

async function writeToDailyNote(
  date: string,
  section: string,
  dryRun: boolean
): Promise<void> {
  const filePath = await ensureDailyNote(date);
  let content = await readFile(filePath, "utf-8");

  const sectionHeader = "### Issue Resolver";
  const startIdx = content.indexOf(sectionHeader);

  if (startIdx !== -1) {
    // Find end of existing section
    const afterStart = content.slice(startIdx);
    const nextHeading = afterStart.search(/\n#{2,3} [^\n]/);
    const navFooter = afterStart.indexOf("\n<< [[");

    let endIdx: number;
    if (nextHeading > 0 && (navFooter < 0 || nextHeading < navFooter)) {
      endIdx = startIdx + nextHeading;
    } else if (navFooter > 0) {
      endIdx = startIdx + navFooter;
    } else {
      endIdx = content.length;
    }

    content =
      content.slice(0, startIdx) + section + "\n" + content.slice(endIdx);
  } else {
    // Insert before nav footer, or append
    const navIdx = content.indexOf("<< [[");
    if (navIdx > 0) {
      content =
        content.slice(0, navIdx) + section + "\n\n" + content.slice(navIdx);
    } else {
      content += "\n" + section + "\n";
    }
  }

  if (dryRun) {
    log("Would write to daily note:");
    console.log(content);
  } else {
    await writeFile(filePath, content, "utf-8");
    log(`Updated daily note: ${filePath}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noAgents = args.includes("--no-agents");
  const dryRun = args.includes("--dry-run");

  if (REPOS.length === 0) {
    log("No repos configured!");
    process.exit(1);
  }

  log(`Scanning ${REPOS.length} repo(s) for open issues containing '${TRIGGER_TOKEN}'...`);

  // Ensure labels exist on all repos
  await ensureAllLabels(dryRun);

  // Fetch candidate issues from all repos in parallel
  const repoIssues = await Promise.all(
    REPOS.map(async (config) => {
      const issues = await fetchCandidateIssues(config);
      return { config, issues };
    })
  );

  const totalIssues = repoIssues.reduce((n, r) => n + r.issues.length, 0);
  log(`Found ${totalIssues} candidate issue(s)`);

  if (totalIssues === 0) {
    // Still write to daily note so we know the script ran
    const section = buildDailyNoteSection([]);
    await writeToDailyNote(today(), section, dryRun);
    log("Done — nothing to process.");
    return;
  }

  // Load OpenCode password for agent sessions
  const password = await loadOpenCodePassword();
  const openCodeUp = !noAgents && (await isOpenCodeRunning(password));

  if (!noAgents && !openCodeUp) {
    log("OpenCode server not reachable — will create worktrees but skip agent sessions");
  }

  // Process each issue
  const processed: ProcessedIssue[] = [];

  for (const { config, issues } of repoIssues) {
    const slug = `${config.owner}/${config.repo}`;

    for (const issue of issues) {
      const isWorking = issue.labels.includes(WORKING_LABEL);
      const wantsPlan = issueRequestsPlan(issue);

      // Non-#plan working issues are already in-flight; do not dispatch again.
      if (isWorking && !wantsPlan) {
        log(
          `Skipping ${slug}#${issue.number}: already has '${WORKING_LABEL}' and no ${PLAN_TOKEN} gate`
        );
        continue;
      }

      log(`Processing ${slug}#${issue.number}: ${issue.title}`);

      try {
        // 1. Claim new issues so they are not picked up twice.
        if (!isWorking) {
          if (!dryRun) {
            await addLabel(slug, issue.number, WORKING_LABEL);
            log(`Added '${WORKING_LABEL}' label to ${slug}#${issue.number}`);
          } else {
            log(`Would add '${WORKING_LABEL}' label to ${slug}#${issue.number}`);
          }
        }

        // 2. For #plan issues already in working state, only dispatch implementation
        // after approved plan reaction by the owner.
        let approvedPlanBody: string | undefined;
        let mode: "plan" | "implementation" = wantsPlan ? "plan" : "implementation";

        if (wantsPlan && isWorking) {
          const comments = await fetchIssueComments(slug, issue.number);
          const planComment = latestCommentWithMarker(comments, PLAN_MARKER);

          if (!planComment) {
            log(
              `Waiting on plan comment for ${slug}#${issue.number} (${PLAN_MARKER})`
            );
            continue;
          }

          if (hasCommentMarker(comments, IMPLEMENTATION_DISPATCH_MARKER)) {
            log(
              `Skipping ${slug}#${issue.number}: implementation already dispatched after plan approval`
            );
            continue;
          }

          const approved = await hasPlanApprovalReaction(
            slug,
            planComment.id,
            PLAN_APPROVER_LOGIN
          );

          if (!approved) {
            log(
              `Waiting for 👍 from @${PLAN_APPROVER_LOGIN} on plan comment for ${slug}#${issue.number}`
            );
            continue;
          }

          mode = "implementation";
          approvedPlanBody = planComment.body;
          log(
            `Plan approved by @${PLAN_APPROVER_LOGIN}; dispatching implementation for ${slug}#${issue.number}`
          );
        }

        // 3. Create/reuse worktree
        const { worktreePath, branchName } = await createWorktree(
          config,
          issue,
          dryRun
        );

        const result: ProcessedIssue = {
          config,
          issue,
          worktreePath,
          branchName,
          mode,
        };

        // 4. Spawn agent session
        if (!noAgents && openCodeUp && !dryRun) {
          const sessionId = await spawnAgentSession(
            config,
            issue,
            worktreePath,
            branchName,
            mode,
            approvedPlanBody,
            password
          );
          result.sessionId = sessionId;
          result.mode = mode;

          if (!sessionId) {
            result.error = `Failed to spawn ${mode} session`;
          } else if (wantsPlan && isWorking && mode === "implementation") {
            await addIssueComment(
              slug,
              issue.number,
              `${IMPLEMENTATION_DISPATCH_MARKER}\n\nPlan approved by @${PLAN_APPROVER_LOGIN}. Implementation session dispatched: ${sessionId}`,
              dryRun
            );
          }
        } else if (noAgents) {
          log("Agent session skipped (--no-agents)");
        } else if (dryRun) {
          log(`Would spawn ${mode} session for ${slug}#${issue.number}`);
          result.mode = mode;
        }

        processed.push(result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logError(`Failed to process ${slug}#${issue.number}: ${errorMsg}`);

        processed.push({
          config,
          issue,
          worktreePath: "",
          branchName: "",
          error: errorMsg,
        });
      }
    }
  }

  // Write summary to daily note
  const section = buildDailyNoteSection(processed);
  await writeToDailyNote(today(), section, dryRun);

  log(`Done — processed ${processed.length} issue(s).`);
}

main().catch((err) => {
  console.error("[issue-resolver] Fatal error:", err);
  process.exit(1);
});
