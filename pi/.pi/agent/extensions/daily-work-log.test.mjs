import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
	DEFAULT_LOG_DIR,
	createInputRecord,
	formatLocalDate,
	getLogFilePath,
} from "./daily-work-log-utils.mjs";

test("formatLocalDate uses local calendar date", () => {
	const date = new Date(2026, 3, 23, 18, 27, 27, 72);
	assert.equal(formatLocalDate(date), "2026-04-23");
});

test("getLogFilePath uses the default log directory and JSONL filename", () => {
	const date = new Date(2026, 3, 23, 18, 27, 27, 72);
	assert.equal(getLogFilePath(DEFAULT_LOG_DIR, date), path.join(DEFAULT_LOG_DIR, "2026-04-23.jsonl"));
});

test("createInputRecord captures raw input metadata without image payloads", () => {
	const now = new Date(Date.UTC(2026, 3, 23, 18, 27, 27, 72));
	const record = createInputRecord({
		now,
		cwd: "/Users/christian/dotfiles",
		text: "/model",
		source: "interactive",
		images: [{ type: "image", mimeType: "image/png", data: "..." }],
		sessionFile: "/tmp/session.jsonl",
		sessionId: "session-123",
		sessionName: "Daily work",
		gitBranch: "main",
	});

	assert.deepEqual(record, {
		type: "input",
		timestamp: "2026-04-23T18:27:27.072Z",
		epochMs: now.getTime(),
		date: formatLocalDate(now),
		utcDate: "2026-04-23",
		cwd: "/Users/christian/dotfiles",
		source: "interactive",
		text: "/model",
		hasImages: true,
		imageCount: 1,
		sessionFile: "/tmp/session.jsonl",
		sessionId: "session-123",
		sessionName: "Daily work",
		gitBranch: "main",
	});
});
