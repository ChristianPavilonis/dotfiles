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
}) {
	const imageCount = Array.isArray(images) ? images.length : 0;

	return {
		type: "input",
		timestamp: now.toISOString(),
		epochMs: now.getTime(),
		date: formatLocalDate(now),
		utcDate: now.toISOString().slice(0, 10),
		cwd,
		source,
		text,
		hasImages: imageCount > 0,
		imageCount,
		sessionFile: sessionFile ?? null,
		sessionId: sessionId ?? null,
		sessionName: sessionName ?? null,
		gitBranch: gitBranch ?? null,
	};
}
