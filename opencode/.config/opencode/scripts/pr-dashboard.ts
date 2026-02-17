#!/usr/bin/env bun
/**
 * PR Dashboard
 *
 * Fetches PRs you need to review and your PRs with requested changes,
 * writes a summary to the Obsidian daily note, creates per-PR review
 * notes, and optionally spawns OpenCode agent sessions for deeper review.
 *
 * Usage:
 *   bun run pr-dashboard.ts [--no-agents] [--dry-run]
 *
 * Flags:
 *   --no-agents  Skip spawning OpenCode agent sessions
 *   --dry-run    Print what would be written without modifying files
 */

import { $ } from "bun";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Repos to scan. Set localPath to enable agent sessions for that repo. */
const REPOS: RepoConfig[] = [
  {
    owner: "IABTechLab",
    repo: "trusted-server",
    localPath: "~/projects/trusted-server",
    project: "trusted-server",
  },
  {
    owner: "stackpop",
    repo: "mocktioneer",
    localPath: "~/projects/mocktioneer",
  },
  {
    owner: "stackpop",
    repo: "edgezero",
    localPath: "~/projects/edgezero",
  },
];

const VAULT_PATH = expandHome("~/Documents/MyObsidianVault");
const DAILY_DIR = join(VAULT_PATH, "daily");
const NOTES_DIR = join(VAULT_PATH, "Notes");
const OPENCODE_URL = "http://localhost:4096";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepoConfig {
  owner: string;
  repo: string;
  localPath?: string;
  /** Obsidian project slug for frontmatter. */
  project?: string;
}

interface PR {
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

interface RepoPRs {
  config: RepoConfig;
  toReview: PR[];
  changesRequested: PR[];
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

function formatTimestamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
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
  console.log(`[pr-dashboard] ${msg}`);
}

// ---------------------------------------------------------------------------
// GitHub data fetching
// ---------------------------------------------------------------------------

const GH_PR_FIELDS =
  "number,title,url,body,additions,deletions,changedFiles,labels,reviewDecision,updatedAt,author,baseRefName,headRefName";

function parseGhPRs(raw: string): PR[] {
  if (!raw.trim()) return [];
  try {
    const items = JSON.parse(raw) as Array<Record<string, unknown>>;
    return items.map((item) => ({
      number: item.number as number,
      title: item.title as string,
      author: (item.author as { login: string })?.login ?? "unknown",
      url: item.url as string,
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

async function fetchRepoPRs(config: RepoConfig): Promise<RepoPRs> {
  const slug = `${config.owner}/${config.repo}`;

  // PRs where I'm a requested reviewer
  const toReviewRaw =
    await $`gh pr list --repo ${slug} --search "review-requested:@me" --json ${GH_PR_FIELDS}`
      .text()
      .catch(() => "[]");

  // My PRs that have changes_requested review decision
  const myPRsRaw =
    await $`gh pr list --repo ${slug} --author @me --json ${GH_PR_FIELDS}`
      .text()
      .catch(() => "[]");

  const toReview = parseGhPRs(toReviewRaw);
  const myPRs = parseGhPRs(myPRsRaw);
  const changesRequested = myPRs.filter(
    (pr) => pr.reviewDecision === "CHANGES_REQUESTED"
  );

  return { config, toReview, changesRequested };
}

// ---------------------------------------------------------------------------
// Daily note
// ---------------------------------------------------------------------------

async function ensureDailyNote(date: string): Promise<string> {
  const filePath = join(DAILY_DIR, `${date}.md`);
  if (await fileExists(filePath)) {
    return filePath;
  }

  // Create from template
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

function buildDashboardSection(allResults: RepoPRs[]): string {
  const totalToReview = allResults.reduce((n, r) => n + r.toReview.length, 0);
  const totalChanges = allResults.reduce(
    (n, r) => n + r.changesRequested.length,
    0
  );

  const lines: string[] = [];
  lines.push("### PR Dashboard");
  lines.push(`*Updated ${now()}*`);
  lines.push("");

  if (totalToReview === 0 && totalChanges === 0) {
    lines.push("No pending PRs.");
    return lines.join("\n");
  }

  if (totalToReview > 0) {
    lines.push("**PRs to review:**");
    for (const result of allResults) {
      for (const pr of result.toReview) {
        const slug = `${result.config.owner}/${result.config.repo}`;
        const stats = `+${pr.additions}/-${pr.deletions}`;
        lines.push(
          `- [ ] [${slug}#${pr.number}](${pr.url}) - ${pr.title} (${stats}) -- @${pr.author}`
        );
      }
    }
    lines.push("");
  }

  if (totalChanges > 0) {
    lines.push("**My PRs needing changes:**");
    for (const result of allResults) {
      for (const pr of result.changesRequested) {
        const slug = `${result.config.owner}/${result.config.repo}`;
        lines.push(
          `- [ ] [${slug}#${pr.number}](${pr.url}) - ${pr.title}`
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function writeToDailyNote(
  date: string,
  section: string,
  dryRun: boolean
): Promise<void> {
  const filePath = await ensureDailyNote(date);
  let content = await readFile(filePath, "utf-8");

  const sectionHeader = "### PR Dashboard";
  const startIdx = content.indexOf(sectionHeader);

  if (startIdx !== -1) {
    // Find the end of the existing section — next heading or nav footer
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

    content = content.slice(0, startIdx) + section + "\n" + content.slice(endIdx);
  } else {
    // Insert before nav footer, or at end of ## Notes section
    const navIdx = content.indexOf("<< [[");
    if (navIdx > 0) {
      content =
        content.slice(0, navIdx) + section + "\n\n" + content.slice(navIdx);
    } else {
      // Append after ## Notes section
      const notesIdx = content.indexOf("## Notes");
      if (notesIdx !== -1) {
        const afterNotes = content.indexOf("\n\n", notesIdx);
        if (afterNotes !== -1) {
          content =
            content.slice(0, afterNotes + 2) +
            section +
            "\n\n" +
            content.slice(afterNotes + 2);
        } else {
          content += "\n" + section + "\n";
        }
      } else {
        content += "\n" + section + "\n";
      }
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
// Per-PR Obsidian notes
// ---------------------------------------------------------------------------

function prNoteFilename(config: RepoConfig, pr: PR): string {
  return `PR Review - ${config.repo}#${pr.number}.md`;
}

function buildPRNote(config: RepoConfig, pr: PR, kind: "review" | "changes"): string {
  const slug = `${config.owner}/${config.repo}`;
  const project = config.project ?? "ideas";
  const tags =
    kind === "review"
      ? "  - pr-review\n  - needs-review"
      : "  - pr-review\n  - changes-requested";

  const lines: string[] = [];
  lines.push("---");
  lines.push(`created at: ${formatTimestamp()}`);
  lines.push(`project: ${project}`);
  lines.push("type: scratch");
  lines.push("tags:");
  lines.push(tags);
  lines.push("---");
  lines.push("");
  lines.push(`# ${pr.title}`);
  lines.push("");
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| **Repo** | ${slug} |`);
  lines.push(`| **PR** | [#${pr.number}](${pr.url}) |`);
  lines.push(`| **Author** | @${pr.author} |`);
  lines.push(`| **Branch** | \`${pr.head}\` -> \`${pr.base}\` |`);
  lines.push(`| **Changes** | +${pr.additions}/-${pr.deletions} across ${pr.changedFiles} files |`);
  if (pr.labels.length > 0) {
    lines.push(`| **Labels** | ${pr.labels.join(", ")} |`);
  }
  lines.push("");

  if (pr.body) {
    lines.push("## Description");
    lines.push("");
    lines.push(pr.body);
    lines.push("");
  }

  if (kind === "review") {
    lines.push("## Review Notes");
    lines.push("");
    lines.push("<!-- Add your review notes here -->");
    lines.push("");
  } else {
    lines.push("## Changes Requested");
    lines.push("");
    lines.push("<!-- Review comments and action plan will go here -->");
    lines.push("");
  }

  lines.push("");
  lines.push("#### Links");
  lines.push("");

  return lines.join("\n");
}

async function createPRNotes(
  allResults: RepoPRs[],
  dryRun: boolean
): Promise<void> {
  await mkdir(NOTES_DIR, { recursive: true });

  for (const result of allResults) {
    for (const pr of result.toReview) {
      const filename = prNoteFilename(result.config, pr);
      const filePath = join(NOTES_DIR, filename);
      if (await fileExists(filePath)) {
        log(`Skipping existing note: ${filename}`);
        continue;
      }
      const content = buildPRNote(result.config, pr, "review");
      if (dryRun) {
        log(`Would create: ${filename}`);
      } else {
        await writeFile(filePath, content, "utf-8");
        log(`Created note: ${filename}`);
      }
    }

    for (const pr of result.changesRequested) {
      const filename = prNoteFilename(result.config, pr);
      const filePath = join(NOTES_DIR, filename);
      if (await fileExists(filePath)) {
        log(`Skipping existing note: ${filename}`);
        continue;
      }
      const content = buildPRNote(result.config, pr, "changes");
      if (dryRun) {
        log(`Would create: ${filename}`);
      } else {
        await writeFile(filePath, content, "utf-8");
        log(`Created note: ${filename}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OpenCode agent sessions
// ---------------------------------------------------------------------------

async function isOpenCodeRunning(): Promise<boolean> {
  try {
    const resp = await fetch(`${OPENCODE_URL}/global/health`);
    return resp.ok;
  } catch {
    return false;
  }
}

async function spawnReviewSession(
  config: RepoConfig,
  pr: PR,
  kind: "review" | "changes"
): Promise<void> {
  const localPath = config.localPath ? expandHome(config.localPath) : undefined;
  if (!localPath || !(await fileExists(localPath))) {
    log(
      `Skipping agent session for ${config.repo}#${pr.number} — no local checkout`
    );
    return;
  }

  const dirParam = encodeURIComponent(localPath);
  const slug = `${config.owner}/${config.repo}`;

  // Create session
  const sessionResp = await fetch(
    `${OPENCODE_URL}/session?directory=${dirParam}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:
          kind === "review"
            ? `Review PR ${slug}#${pr.number}: ${pr.title}`
            : `Plan changes for ${slug}#${pr.number}: ${pr.title}`,
      }),
    }
  );

  if (!sessionResp.ok) {
    log(`Failed to create session for ${slug}#${pr.number}: ${sessionResp.status}`);
    return;
  }

  const session = (await sessionResp.json()) as { id: string };

  // Build prompt
  let prompt: string;
  if (kind === "review") {
    prompt = [
      `Review pull request #${pr.number} in ${slug}.`,
      `Title: ${pr.title}`,
      `Author: @${pr.author}`,
      `Branch: ${pr.head} -> ${pr.base}`,
      "",
      "Steps:",
      "1. Use `gh pr diff ${pr.number}` to read the changes.",
      "2. Use `gh api repos/${slug}/pulls/${pr.number}/comments` to check existing review comments.",
      "3. Analyze the diff for bugs, security issues, performance concerns, and code quality.",
      "4. Write a structured review summary.",
      "5. Write the review findings to an Obsidian note at:",
      `   ~/Documents/MyObsidianVault/Notes/${prNoteFilename(config, pr)}`,
      "   Update the '## Review Notes' section with your findings.",
      "",
      "Do NOT submit a review on GitHub. Only write findings to the Obsidian note.",
    ].join("\n");
  } else {
    prompt = [
      `Read the review comments on my PR #${pr.number} in ${slug}.`,
      `Title: ${pr.title}`,
      `Branch: ${pr.head} -> ${pr.base}`,
      "",
      "Steps:",
      `1. Use \`gh api repos/${slug}/pulls/${pr.number}/comments\` to fetch all review comments.`,
      `2. Use \`gh pr diff ${pr.number}\` to understand the full context of changes.`,
      "3. Analyze what changes are being requested.",
      "4. Create an action plan with specific file/line references.",
      "5. Write the action plan to the Obsidian note at:",
      `   ~/Documents/MyObsidianVault/Notes/${prNoteFilename(config, pr)}`,
      "   Update the '## Changes Requested' section with the action plan.",
    ].join("\n");
  }

  // Send async prompt
  const promptResp = await fetch(
    `${OPENCODE_URL}/session/${session.id}/prompt_async?directory=${dirParam}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: prompt }],
      }),
    }
  );

  if (promptResp.ok) {
    log(
      `Spawned ${kind} agent session for ${slug}#${pr.number} (session: ${session.id})`
    );
  } else {
    log(
      `Failed to send prompt for ${slug}#${pr.number}: ${promptResp.status}`
    );
  }
}

async function spawnAgentSessions(allResults: RepoPRs[]): Promise<void> {
  if (!(await isOpenCodeRunning())) {
    log("OpenCode server not reachable — skipping agent sessions");
    return;
  }

  for (const result of allResults) {
    for (const pr of result.toReview) {
      await spawnReviewSession(result.config, pr, "review");
    }
    for (const pr of result.changesRequested) {
      await spawnReviewSession(result.config, pr, "changes");
    }
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
    log("No repos configured! Edit the REPOS array in pr-dashboard.ts");
    log("Example:");
    log(
      '  { owner: "org", repo: "my-repo", localPath: "~/projects/my-repo", project: "slug" }'
    );
    process.exit(1);
  }

  log(`Scanning ${REPOS.length} repo(s)...`);

  // Fetch all PR data in parallel
  const allResults = await Promise.all(REPOS.map(fetchRepoPRs));

  const totalToReview = allResults.reduce((n, r) => n + r.toReview.length, 0);
  const totalChanges = allResults.reduce(
    (n, r) => n + r.changesRequested.length,
    0
  );

  log(`Found ${totalToReview} PR(s) to review, ${totalChanges} PR(s) needing changes`);

  // Build and write daily note section
  const section = buildDashboardSection(allResults);
  const date = today();
  await writeToDailyNote(date, section, dryRun);

  // Create per-PR notes
  await createPRNotes(allResults, dryRun);

  // Spawn agent sessions
  if (!noAgents && !dryRun) {
    await spawnAgentSessions(allResults);
  } else if (noAgents) {
    log("Agent sessions skipped (--no-agents)");
  }

  log("Done!");
}

main().catch((err) => {
  console.error("[pr-dashboard] Fatal error:", err);
  process.exit(1);
});
