import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
	DEFAULT_LOG_DIR,
	createInputRecord,
	getLogFilePath,
} from "./daily-work-log-utils.mjs";

const execFileAsync = promisify(execFile);
const LOG_DIR = process.env.PI_DAILY_WORK_LOG_DIR || DEFAULT_LOG_DIR;
const STATUS_KEY = "daily-work-log";
const GIT_BRANCH_CACHE_TTL_MS = 5_000;

type GitBranchCacheEntry = {
	branch: string | null;
	expiresAt: number;
};

let appendQueue = Promise.resolve();
let warnedWriteFailure = false;
const gitBranchCache = new Map<string, GitBranchCacheEntry>();

async function getGitBranch(cwd: string): Promise<string | null> {
	const cached = gitBranchCache.get(cwd);
	if (cached && cached.expiresAt > Date.now()) return cached.branch;

	try {
		const { stdout } = await execFileAsync("git", ["-C", cwd, "branch", "--show-current"], {
			encoding: "utf8",
		});
		const branch = stdout.trim() || null;
		gitBranchCache.set(cwd, {
			branch,
			expiresAt: Date.now() + GIT_BRANCH_CACHE_TTL_MS,
		});
		return branch;
	} catch {
		gitBranchCache.set(cwd, {
			branch: null,
			expiresAt: Date.now() + GIT_BRANCH_CACHE_TTL_MS,
		});
		return null;
	}
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
	pi.on("session_start", async (_event, ctx) => {
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

		const now = new Date();
		const gitBranch = await getGitBranch(ctx.cwd);
		const filePath = getLogFilePath(LOG_DIR, now);
		const record = createInputRecord({
			now,
			cwd: ctx.cwd,
			text: event.text,
			source: event.source,
			images: event.images,
			sessionFile: ctx.sessionManager.getSessionFile(),
			sessionId: ctx.sessionManager.getSessionId(),
			sessionName: ctx.sessionManager.getSessionName(),
			gitBranch,
		});

		queueAppend(filePath, `${JSON.stringify(record)}\n`, ctx);
		return { action: "continue" };
	});
}
