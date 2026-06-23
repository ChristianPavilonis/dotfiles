import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const STATUS_KEY = "commit";
const PI_BIN = process.env.PI_COMMIT_PI_BIN || "pi";
const LOG_DIR = process.env.PI_COMMIT_LOG_DIR || path.join(os.homedir(), ".pi", "agent", "commit-jobs");
const COMMIT_MODEL = process.env.PI_COMMIT_MODEL || "openai-codex/gpt-5.3-codex-spark";

function safeJobId(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

function buildCommitPrompt(args: string, cwd: string): string {
	const request = args.trim() || "Create a git commit for the current repository changes.";

	return `You are a background git-commit agent running from a forked copy of the user's current pi conversation.
Use the inherited conversation history as source context, then complete the commit request below.

User commit request:
${request}

Working directory:
${cwd}

Your task:
- Inspect the current git repository state and create exactly one local git commit if it is safe to do so.
- Use the conversation history to understand the intended change and craft an accurate commit message.
- Treat the user commit request as additional instructions; if it includes a desired commit message, use or refine it.

Hard constraints:
- Operate only in the git repository containing the working directory above.
- Do not modify working-tree file contents. You may only update the git index and create a commit.
- Do not push, pull, rebase, merge, reset, stash, clean, or switch branches.
- Do not amend an existing commit unless the user explicitly requested amend.
- Do not stage secrets, credentials, .env files, local machine config, generated logs, build outputs, or unrelated changes.

Expected workflow:
1. Run git status and identify the repository root and current branch.
2. Review staged, unstaged, and untracked changes with git diff/status commands before staging anything.
3. Preserve any intentional existing staging where possible; stage only files that belong in this commit.
4. Run quick, relevant validation if it is obvious and inexpensive. If no suitable validation exists, continue and mention that.
5. Create one commit with a concise subject and useful body when warranted, using non-interactive git commit flags.
6. Finish with a brief report including the commit hash, commit message, files committed, validation run, and any skipped changes.

If there are no committable changes, validation reveals a serious problem, or the changes are unsafe/ambiguous, do not commit. Instead, report exactly why and what you inspected.`;
}

function notify(ctx: any, message: string, level: "info" | "success" | "warning" | "error" = "info"): void {
	try {
		if (ctx.hasUI) ctx.ui.notify(message, level);
	} catch {
		// The original extension context may be stale if the user switched sessions/reloaded.
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("commit", {
		description: "Spawn a background pi agent to commit the current repo changes from this chat context",
		handler: async (args, ctx) => {
			const request = args.trim();

			// Intentionally do not wait for idle: /commit mirrors /note by forking this session immediately.
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (!sessionFile) {
				notify(ctx, "Cannot /commit: current session is not persisted.", "error");
				return;
			}

			mkdirSync(LOG_DIR, { recursive: true });
			const jobId = safeJobId();
			const logPath = path.join(LOG_DIR, `${jobId}.log`);
			const log = createWriteStream(logPath, { flags: "a" });
			log.write(`# /commit job ${jobId}\n`);
			log.write(`# session: ${sessionFile}\n`);
			log.write(`# cwd: ${ctx.cwd}\n`);
			log.write(`# request: ${request || "(none)"}\n`);
			log.write(`# model: ${COMMIT_MODEL}\n`);
			log.write("\n");

			const child = spawn(
				PI_BIN,
				[
					"--model",
					COMMIT_MODEL,
					"--fork",
					sessionFile,
					"--no-extensions",
					"--tools",
					"bash,read,grep,find,ls",
					"-p",
					buildCommitPrompt(request, ctx.cwd),
				],
				{
					cwd: ctx.cwd,
					env: process.env,
					stdio: ["ignore", "pipe", "pipe"],
				},
			);

			child.stdout?.pipe(log, { end: false });
			child.stderr?.pipe(log, { end: false });

			const job = {
				id: jobId,
				request: request || "Create a git commit for the current repository changes.",
				sessionFile,
				logPath,
				cwd: ctx.cwd,
				model: COMMIT_MODEL,
				startedAt: Date.now(),
			};
			pi.appendEntry("commit-job", job);

			notify(ctx, `commit agent started: ${jobId} using ${COMMIT_MODEL}`, "info");
			try {
				ctx.ui.setStatus(STATUS_KEY, `commit → ${jobId}`);
			} catch {
				// best effort
			}

			child.on("error", (error) => {
				log.write(`\n# spawn error: ${error.message}\n`);
				log.end();
				notify(ctx, `commit agent failed to start: ${error.message}`, "error");
			});

			child.on("close", (code, signal) => {
				log.write(`\n# exited code=${code} signal=${signal ?? ""}\n`);
				log.end();
				if (code === 0) {
					notify(ctx, `commit agent finished: ${logPath}`, "success");
				} else {
					notify(ctx, `commit agent failed (${code ?? signal}). Log: ${logPath}`, "error");
				}
			});
		},
	});

	pi.registerCommand("commit-status", {
		description: "Show recent /commit jobs recorded in this session",
		handler: async (_args, ctx) => {
			const jobs = ctx.sessionManager
				.getEntries()
				.filter((entry: any) => entry.type === "custom" && entry.customType === "commit-job")
				.map((entry: any) => entry.data)
				.filter(Boolean)
				.slice(-5);

			if (jobs.length === 0) {
				notify(ctx, `No /commit jobs in this session. Logs directory: ${LOG_DIR}`, "info");
				return;
			}

			const summary = jobs
				.map((job: any) => `${job.id}: ${job.request}\n  ${job.logPath}`)
				.join("\n");
			notify(ctx, summary, "info");
		},
	});
}
