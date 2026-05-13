import os from "node:os";
import path from "node:path";

export const DEFAULT_LOG_DIR = path.join(os.homedir(), ".pi", "agent", "logs");

function pad(value) {
	return String(value).padStart(2, "0");
}

export function formatLocalDate(date = new Date()) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getLogFilePath(logDir = DEFAULT_LOG_DIR, date = new Date()) {
	return path.join(logDir, `${formatLocalDate(date)}.jsonl`);
}

export function getRepoName(gitRepo) {
	if (!gitRepo) return null;
	const trimmed = gitRepo.replace(/[\\/]+$/, "");
	return path.basename(trimmed) || null;
}

function createBaseRecord({
	type,
	now = new Date(),
	cwd,
	sessionFile,
	sessionId,
	sessionName,
	gitBranch,
	gitRepo,
}) {
	return {
		type,
		timestamp: now.toISOString(),
		epochMs: now.getTime(),
		date: formatLocalDate(now),
		utcDate: now.toISOString().slice(0, 10),
		cwd,
		sessionFile: sessionFile ?? null,
		sessionId: sessionId ?? null,
		sessionName: sessionName ?? null,
		gitBranch: gitBranch ?? null,
		gitRepo: gitRepo ?? null,
		repoName: getRepoName(gitRepo),
	};
}

export function createInputRecord({
	now = new Date(),
	cwd,
	text,
	source,
	images,
	sessionFile,
	sessionId,
	sessionName,
	gitBranch,
	gitRepo,
}) {
	const imageCount = Array.isArray(images) ? images.length : 0;

	return {
		...createBaseRecord({
			type: "input",
			now,
			cwd,
			sessionFile,
			sessionId,
			sessionName,
			gitBranch,
			gitRepo,
		}),
		source,
		text,
		hasImages: imageCount > 0,
		imageCount,
	};
}

export function createSessionStartRecord({
	now = new Date(),
	cwd,
	sessionFile,
	sessionId,
	sessionName,
	gitBranch,
	gitRepo,
	reason,
	previousSessionFile,
}) {
	return {
		...createBaseRecord({
			type: "session_start",
			now,
			cwd,
			sessionFile,
			sessionId,
			sessionName,
			gitBranch,
			gitRepo,
		}),
		reason,
		previousSessionFile: previousSessionFile ?? null,
	};
}

export function createAgentEndRecord({
	now = new Date(),
	cwd,
	sessionFile,
	sessionId,
	sessionName,
	gitBranch,
	gitRepo,
	durationMs,
	messageCount,
}) {
	return {
		...createBaseRecord({
			type: "agent_end",
			now,
			cwd,
			sessionFile,
			sessionId,
			sessionName,
			gitBranch,
			gitRepo,
		}),
		durationMs: typeof durationMs === "number" ? durationMs : null,
		durationSeconds: typeof durationMs === "number" ? Number((durationMs / 1000).toFixed(3)) : null,
		messageCount: typeof messageCount === "number" ? messageCount : null,
	};
}
