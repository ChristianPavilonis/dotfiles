import { definePlugin } from "@yesman/sdk";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_PROJECTS_ROOT = "/home/christian/projects";
const DEFAULT_BRANCHES = ["main", "master"];
const DEFAULT_CONCURRENCY = 2;

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value.filter((item) => item.trim().length > 0)
    : fallback;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type BranchResult = {
  branch: string;
  status: "updated" | "skipped" | "failed";
  detail: string;
};

type RepoResult = {
  repo: string;
  path: string;
  status: "updated" | "skipped" | "failed";
  branches: BranchResult[];
};

async function runGit(repoPath: string, args: string[]): Promise<CommandResult> {
  const command = new Deno.Command("git", {
    args,
    cwd: repoPath,
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();
  const decoder = new TextDecoder();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout).trim(),
    stderr: decoder.decode(output.stderr).trim(),
  };
}

async function isGitRepo(path: string): Promise<boolean> {
  const result = await runGit(path, ["rev-parse", "--is-inside-work-tree"]);
  return result.code === 0 && result.stdout === "true";
}

async function discoverRepos(projectsRoot: string): Promise<string[]> {
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(projectsRoot, entry.name));

  const repos: string[] = [];
  for (const candidate of candidates) {
    if (await isGitRepo(candidate)) {
      repos.push(candidate);
    }
  }
  return repos.sort();
}

async function hasRef(repoPath: string, ref: string): Promise<boolean> {
  const result = await runGit(repoPath, ["show-ref", "--verify", "--quiet", ref]);
  return result.code === 0;
}

async function currentBranch(repoPath: string): Promise<string | null> {
  const result = await runGit(repoPath, ["branch", "--show-current"]);
  return result.code === 0 && result.stdout.length > 0 ? result.stdout : null;
}

async function isDirty(repoPath: string): Promise<boolean> {
  const result = await runGit(repoPath, ["status", "--porcelain"]);
  return result.code !== 0 || result.stdout.length > 0;
}

async function updateBranch(repoPath: string, branch: string): Promise<BranchResult> {
  const localRef = `refs/heads/${branch}`;
  const remoteRef = `refs/remotes/origin/${branch}`;
  const [hasLocal, hasRemote] = await Promise.all([
    hasRef(repoPath, localRef),
    hasRef(repoPath, remoteRef),
  ]);

  if (!hasLocal && !hasRemote) {
    return { branch, status: "skipped", detail: "branch not found locally or on origin" };
  }

  const activeBranch = await currentBranch(repoPath);
  if (activeBranch === branch) {
    if (await isDirty(repoPath)) {
      return { branch, status: "skipped", detail: "branch is checked out with uncommitted changes" };
    }

    const pull = await runGit(repoPath, ["pull", "--ff-only", "origin", branch]);
    if (pull.code !== 0) {
      return { branch, status: "failed", detail: pull.stderr || pull.stdout };
    }
    return { branch, status: "updated", detail: pull.stdout || "already up to date" };
  }

  if (!hasRemote) {
    return { branch, status: "skipped", detail: "no origin branch to fetch" };
  }

  const fetch = await runGit(repoPath, ["fetch", "origin", `${branch}:${branch}`]);
  if (fetch.code !== 0) {
    return { branch, status: "failed", detail: fetch.stderr || fetch.stdout };
  }

  if (!hasLocal) {
    await runGit(repoPath, ["branch", "--set-upstream-to", `origin/${branch}`, branch]);
  }

  return { branch, status: "updated", detail: fetch.stderr || fetch.stdout || "already up to date" };
}

async function updateRepo(repoPath: string, branches: string[]): Promise<RepoResult> {
  const repo = repoPath.split("/").pop() ?? repoPath;
  const remote = await runGit(repoPath, ["remote", "get-url", "origin"]);
  if (remote.code !== 0) {
    return {
      repo,
      path: repoPath,
      status: "skipped",
      branches: [{ branch: "origin", status: "skipped", detail: "no origin remote" }],
    };
  }

  const prune = await runGit(repoPath, ["fetch", "--prune", "origin"]);
  if (prune.code !== 0) {
    return {
      repo,
      path: repoPath,
      status: "failed",
      branches: [{ branch: "origin", status: "failed", detail: prune.stderr || prune.stdout }],
    };
  }

  const results: BranchResult[] = [];
  for (const branch of branches) {
    results.push(await updateBranch(repoPath, branch));
  }

  const status = results.some((result) => result.status === "failed")
    ? "failed"
    : results.some((result) => result.status === "updated")
    ? "updated"
    : "skipped";

  return { repo, path: repoPath, status, branches: results };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export default definePlugin((plugin) => {
  plugin.schedule("update-main-branches", "30 6 * * *", {
    type: "git-main-updater.update",
    payload: { reason: "daily schedule" },
  });

  plugin.on("system.started", async (ctx) => {
    await ctx.log("git main updater plugin ready", {
      event: "git-main-updater.update",
      schedule: "update-main-branches",
      cron: "30 6 * * *",
    });
  });

  plugin.on("git-main-updater.update", async (ctx, event) => {
    const payload = event.payload && typeof event.payload === "object"
      ? event.payload as {
        projectsRoot?: unknown;
        branches?: unknown;
        concurrency?: unknown;
      }
      : {};

    const projectsRoot = asString(
      payload.projectsRoot,
      (await ctx.config.get<string>("projects_root")) ?? DEFAULT_PROJECTS_ROOT,
    );
    const branches = asStringArray(
      payload.branches,
      (await ctx.config.get<string[]>("branches")) ?? DEFAULT_BRANCHES,
    );
    const concurrency = asPositiveInteger(
      payload.concurrency,
      (await ctx.config.get<number>("concurrency")) ?? DEFAULT_CONCURRENCY,
    );

    await ctx.log("updating main branches", { projectsRoot, branches, concurrency });

    const repos = await discoverRepos(projectsRoot);
    const results = await runWithConcurrency(
      repos,
      concurrency,
      (repoPath) => updateRepo(repoPath, branches),
    );

    const summary = {
      projectsRoot,
      repoCount: results.length,
      updated: results.filter((result) => result.status === "updated").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
    };

    await ctx.log("main branch update finished", { ...summary, results });

    await ctx.emit({
      type: summary.failed > 0
        ? "git-main-updater.update.failed"
        : "git-main-updater.update.completed",
      payload: { ...summary, results },
    });
  });
});
