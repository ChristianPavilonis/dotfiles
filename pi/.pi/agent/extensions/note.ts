import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const STATUS_KEY = "note";
const PI_BIN = process.env.PI_NOTE_PI_BIN || "pi";
const VAULT_DIR = process.env.PI_NOTE_VAULT_DIR || path.join(os.homedir(), "Documents", "MyObsidianVault");
const LOG_DIR = process.env.PI_NOTE_LOG_DIR || path.join(os.homedir(), ".pi", "agent", "note-jobs");
const OBSIDIAN_MARKDOWN_SKILL = path.join(os.homedir(), ".pi", "agent", "skills", "obsidian-markdown", "SKILL.md");
const OBSIDIAN_NOTE_TYPES_SKILL = path.join(os.homedir(), ".pi", "agent", "skills", "obsidian-note-types", "SKILL.md");

const NOTE_MODEL_SMALL = process.env.PI_NOTE_MODEL_SMALL || "openai-codex/gpt-5.3-codex-spark";
const NOTE_MODEL_LARGE = process.env.PI_NOTE_MODEL_LARGE || "openai-codex/gpt-5.4-mini";
const NOTE_MODEL_SMALL_CONTEXT_WINDOW = Number(process.env.PI_NOTE_MODEL_SMALL_CONTEXT_WINDOW || 128_000);
const NOTE_MODEL_LARGE_CONTEXT_WINDOW = Number(process.env.PI_NOTE_MODEL_LARGE_CONTEXT_WINDOW || 272_000);
const NOTE_MODEL_CONTEXT_RESERVE = Number(process.env.PI_NOTE_MODEL_CONTEXT_RESERVE || 16_384);

const PROJECTS = ["rigzilla", "trusted-server", "scrapezilla", "tauritutorials", "ideas", "yesman"] as const;

function formatLocalDateTime(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function safeJobId(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

function chooseNoteModel(ctx: any): { model: string; tokens: number | null; reason: string; warning?: string } {
	const usage = ctx.getContextUsage?.();
	const tokens = typeof usage?.tokens === "number" ? usage.tokens : null;
	const smallLimit = NOTE_MODEL_SMALL_CONTEXT_WINDOW - NOTE_MODEL_CONTEXT_RESERVE;
	const largeLimit = NOTE_MODEL_LARGE_CONTEXT_WINDOW - NOTE_MODEL_CONTEXT_RESERVE;

	if (tokens === null) {
		return {
			model: NOTE_MODEL_LARGE,
			tokens,
			reason: "context usage unknown; using larger cheap model",
		};
	}

	if (tokens <= smallLimit) {
		return {
			model: NOTE_MODEL_SMALL,
			tokens,
			reason: `estimated context ${tokens.toLocaleString()} fits ${NOTE_MODEL_SMALL}`,
		};
	}

	return {
		model: NOTE_MODEL_LARGE,
		tokens,
		reason: `estimated context ${tokens.toLocaleString()} exceeds ${NOTE_MODEL_SMALL} safe limit (${smallLimit.toLocaleString()})`,
		warning:
			tokens > largeLimit
				? `estimated context ${tokens.toLocaleString()} may exceed ${NOTE_MODEL_LARGE} safe limit (${largeLimit.toLocaleString()})`
				: undefined,
	};
}

function buildNotePrompt(args: string, now = new Date()): string {
	const today = now.toISOString().slice(0, 10);
	const createdAt = formatLocalDateTime(now);

	return `You are a background note-taking agent running from a forked copy of the user's current pi conversation.
Use the inherited conversation history as source context, then complete the note request below.

User note request:
${args}

Write or update an Obsidian note in this vault:
${VAULT_DIR}

Hard constraints:
- Only read/edit/create files inside ${VAULT_DIR}.
- Do not modify the code repository or files outside the vault.
- Do not use shell commands; use read/find/grep/ls/write/edit tools only.
- Prefer updating a relevant existing note over creating a duplicate.
- Keep the result concise, structured, and useful for future recall.

Obsidian note rules:
- Use Obsidian-flavored Markdown.
- Every created note must start with this required frontmatter shape:
---
created at: ${createdAt}
project: ideas
type: note
status: current
tags: []
---
- The project field must be exactly one of: ${PROJECTS.join(", ")}.
- If the project is unclear, use project: ideas.
- Type must be one of: project, task, issue, plan, reference, log, scratch, note.
- Use the most specific semantic type and an appropriate lowercase status.
- If this is a daily/work-log style request, write/update a daily note for ${today} under a Daily notes folder if present; otherwise create it sensibly in the vault.
- Otherwise create/update a note under Notes/ when possible.
- Include a "#### Links" section at the bottom of created notes.

Finish with a brief report containing the exact file path(s) changed.`;
}

function notify(ctx: any, message: string, level: "info" | "success" | "warning" | "error" = "info"): void {
	try {
		if (ctx.hasUI) ctx.ui.notify(message, level);
	} catch {
		// The original extension context may be stale if the user switched sessions/reloaded.
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("note", {
		description: "Spawn a background pi agent to jot an Obsidian note from this chat context",
		handler: async (args, ctx) => {
			const request = args.trim();
			if (!request) {
				notify(ctx, "Usage: /note <what should be captured?>", "warning");
				return;
			}

			// Intentionally do not wait for idle: /note is meant to work while the main agent is busy.
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (!sessionFile) {
				notify(ctx, "Cannot /note: current session is not persisted.", "error");
				return;
			}

			mkdirSync(LOG_DIR, { recursive: true });
			const jobId = safeJobId();
			const logPath = path.join(LOG_DIR, `${jobId}.log`);
			const log = createWriteStream(logPath, { flags: "a" });
			log.write(`# /note job ${jobId}\n`);
			log.write(`# session: ${sessionFile}\n`);
			log.write(`# cwd: ${ctx.cwd}\n`);
			const noteModel = chooseNoteModel(ctx);
			log.write(`# request: ${request}\n`);
			log.write(`# model: ${noteModel.model}\n`);
			log.write(`# model reason: ${noteModel.reason}\n`);
			if (noteModel.warning) log.write(`# warning: ${noteModel.warning}\n`);
			log.write("\n");

			const child = spawn(
				PI_BIN,
				[
					"--model",
					noteModel.model,
					"--fork",
					sessionFile,
					"--no-extensions",
					"--skill",
					OBSIDIAN_MARKDOWN_SKILL,
					"--skill",
					OBSIDIAN_NOTE_TYPES_SKILL,
					"--tools",
					"read,write,edit,find,grep,ls",
					"-p",
					buildNotePrompt(request),
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
				request,
				sessionFile,
				logPath,
				vaultDir: VAULT_DIR,
				startedAt: Date.now(),
			};
			pi.appendEntry("note-job", job);

			const modelNotice = noteModel.warning ? `${noteModel.model} (${noteModel.warning})` : noteModel.model;
			notify(ctx, `note agent started: ${jobId} using ${modelNotice}`, noteModel.warning ? "warning" : "info");
			try {
				ctx.ui.setStatus(STATUS_KEY, `note → ${jobId}`);
			} catch {
				// best effort
			}

			child.on("error", (error) => {
				log.write(`\n# spawn error: ${error.message}\n`);
				log.end();
				notify(ctx, `note agent failed to start: ${error.message}`, "error");
			});

			child.on("close", (code, signal) => {
				log.write(`\n# exited code=${code} signal=${signal ?? ""}\n`);
				log.end();
				if (code === 0) {
					notify(ctx, `note agent finished: ${logPath}`, "success");
				} else {
					notify(ctx, `note agent failed (${code ?? signal}). Log: ${logPath}`, "error");
				}
			});
		},
	});

	pi.registerCommand("note-status", {
		description: "Show recent /note jobs recorded in this session",
		handler: async (_args, ctx) => {
			const jobs = ctx.sessionManager
				.getEntries()
				.filter((entry: any) => entry.type === "custom" && entry.customType === "note-job")
				.map((entry: any) => entry.data)
				.filter(Boolean)
				.slice(-5);

			if (jobs.length === 0) {
				notify(ctx, `No /note jobs in this session. Logs directory: ${LOG_DIR}`, "info");
				return;
			}

			const summary = jobs
				.map((job: any) => `${job.id}: ${job.request}\n  ${job.logPath}`)
				.join("\n");
			notify(ctx, summary, "info");
		},
	});
}
