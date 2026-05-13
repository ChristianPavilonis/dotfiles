import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFile, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
	DEFAULT_LOG_DIR,
	createAgentEndRecord,
	createInputRecord,
	createSessionStartRecord,
	getLogFilePath,
} from "./daily-work-log-utils.mjs";

const execFileAsync = promisify(execFile);
const LOG_DIR = process.env.PI_DAILY_WORK_LOG_DIR || DEFAULT_LOG_DIR;
const STATUS_KEY = "daily-work-log";
const GIT_BRANCH_CACHE_TTL_MS = 5_000;

type GitMetadataCacheEntry = {
	branch: string | null;
	repo: string | null;
	expiresAt: number;
};

let appendQueue = Promise.resolve();
let warnedWriteFailure = false;
let currentAgentStartAtMs: number | null = null;
const gitMetadataCache = new Map<string, GitMetadataCacheEntry>();

async function resolveGitRepo(cwd: string, gitCommonDir: string): Promise<string | null> {
	const absoluteGitCommonDir = path.isAbsolute(gitCommonDir)
		? gitCommonDir
		: path.resolve(cwd, gitCommonDir);
	const resolvedGitCommonDir = await realpath(absoluteGitCommonDir).catch(() => absoluteGitCommonDir);

	if (path.basename(resolvedGitCommonDir) === ".git") {
		return path.dirname(resolvedGitCommonDir);
	}

	return resolvedGitCommonDir || null;
}

async function getGitMetadata(cwd: string): Promise<{ branch: string | null; repo: string | null }> {
	const cached = gitMetadataCache.get(cwd);
	if (cached && cached.expiresAt > Date.now()) {
		return { branch: cached.branch, repo: cached.repo };
	}

	try {
		const { stdout } = await execFileAsync(
			"git",
			["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD", "--git-common-dir"],
			{ encoding: "utf8" },
		);
		const [branchLine, gitCommonDirLine] = stdout.trim().split(/\r?\n/, 2);
		const branch = branchLine && branchLine !== "HEAD" ? branchLine : null;
		const repo = gitCommonDirLine ? await resolveGitRepo(cwd, gitCommonDirLine) : null;
		gitMetadataCache.set(cwd, {
			branch,
			repo,
			expiresAt: Date.now() + GIT_BRANCH_CACHE_TTL_MS,
		});
		return { branch, repo };
	} catch {
		gitMetadataCache.set(cwd, {
			branch: null,
			repo: null,
			expiresAt: Date.now() + GIT_BRANCH_CACHE_TTL_MS,
		});
		return { branch: null, repo: null };
	}
}

async function buildLogContext(ctx: any, now = new Date()) {
	const { branch: gitBranch, repo: gitRepo } = await getGitMetadata(ctx.cwd);
	return {
		now,
		filePath: getLogFilePath(LOG_DIR, now),
		cwd: ctx.cwd,
		sessionFile: ctx.sessionManager.getSessionFile(),
		sessionId: ctx.sessionManager.getSessionId(),
		sessionName: ctx.sessionManager.getSessionName(),
		gitBranch,
		gitRepo,
	};
}

function queueAppend(filePath: string, line: string, ctx: any): void {
	appendQueue = appendQueue
		.then(async () => {
			await mkdir(LOG_DIR, { recursive: true });
			await appendFile(filePath, line, "utf8");
		})
		.catch((error: Error) => {
			if (warnedWriteFailure) return;
			warnedWriteFailure = true;
			if (ctx.hasUI) {
				ctx.ui.notify(`daily-work-log: failed to append log (${error.message})`, "warning");
			}
		});
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (event, ctx) => {
		const logContext = await buildLogContext(ctx);
		const record = createSessionStartRecord({
			...logContext,
			reason: event.reason,
			previousSessionFile: event.previousSessionFile,
		});
		queueAppend(logContext.filePath, `${JSON.stringify(record)}\n`, ctx);

		currentAgentStartAtMs = null;
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(STATUS_KEY, `work log → ${getLogFilePath(LOG_DIR)}`);
	});

	pi.registerCommand("daily-work-log-status", {
		description: "Show the current daily work log path",
		handler: async (_args, ctx) => {
			const filePath = getLogFilePath(LOG_DIR);
			ctx.ui.notify(`daily-work-log → ${filePath}`, "info");
		},
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") {
			return { action: "continue" };
		}

		const logContext = await buildLogContext(ctx);
		const record = createInputRecord({
			...logContext,
			text: event.text,
			source: event.source,
			images: event.images,
		});

		queueAppend(logContext.filePath, `${JSON.stringify(record)}\n`, ctx);
		return { action: "continue" };
	});

	pi.on("agent_start", async () => {
		currentAgentStartAtMs = Date.now();
	});

	pi.on("agent_end", async (event, ctx) => {
		const now = new Date();
		const logContext = await buildLogContext(ctx, now);
		const durationMs = currentAgentStartAtMs === null ? null : Math.max(0, now.getTime() - currentAgentStartAtMs);
		currentAgentStartAtMs = null;
		const record = createAgentEndRecord({
			...logContext,
			durationMs,
			messageCount: Array.isArray(event.messages) ? event.messages.length : null,
		});

		queueAppend(logContext.filePath, `${JSON.stringify(record)}\n`, ctx);
	});
}
