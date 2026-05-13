import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
	DEFAULT_LOG_DIR,
	createAgentEndRecord,
	createInputRecord,
	createSessionStartRecord,
	formatLocalDate,
	getLogFilePath,
	getRepoName,
} from "./daily-work-log-utils.mjs";

test("formatLocalDate uses local calendar date", () => {
	const date = new Date(2026, 3, 23, 18, 27, 27, 72);
	assert.equal(formatLocalDate(date), "2026-04-23");
});

test("getLogFilePath uses the default log directory and JSONL filename", () => {
	const date = new Date(2026, 3, 23, 18, 27, 27, 72);
	assert.equal(getLogFilePath(DEFAULT_LOG_DIR, date), path.join(DEFAULT_LOG_DIR, "2026-04-23.jsonl"));
});

test("getRepoName derives a friendly repo name from a repo path", () => {
	assert.equal(getRepoName("/Users/christian/src/my-repo"), "my-repo");
	assert.equal(getRepoName("/Users/christian/src/my-repo/"), "my-repo");
	assert.equal(getRepoName(null), null);
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
		gitRepo: "/Users/christian/src/my-repo",
	});

	assert.deepEqual(record, {
		type: "input",
		timestamp: "2026-04-23T18:27:27.072Z",
		epochMs: now.getTime(),
		date: formatLocalDate(now),
		utcDate: "2026-04-23",
		cwd: "/Users/christian/dotfiles",
		sessionFile: "/tmp/session.jsonl",
		sessionId: "session-123",
		sessionName: "Daily work",
		gitBranch: "main",
		gitRepo: "/Users/christian/src/my-repo",
		repoName: "my-repo",
		source: "interactive",
		text: "/model",
		hasImages: true,
		imageCount: 1,
	});
});

test("createSessionStartRecord captures session lifecycle metadata", () => {
	const now = new Date(Date.UTC(2026, 3, 23, 18, 30, 0, 0));
	const record = createSessionStartRecord({
		now,
		cwd: "/Users/christian/dotfiles",
		sessionFile: "/tmp/session.jsonl",
		sessionId: "session-123",
		sessionName: "Daily work",
		gitBranch: "main",
		gitRepo: "/Users/christian/src/my-repo",
		reason: "resume",
		previousSessionFile: "/tmp/previous-session.jsonl",
	});

	assert.deepEqual(record, {
		type: "session_start",
		timestamp: "2026-04-23T18:30:00.000Z",
		epochMs: now.getTime(),
		date: formatLocalDate(now),
		utcDate: "2026-04-23",
		cwd: "/Users/christian/dotfiles",
		sessionFile: "/tmp/session.jsonl",
		sessionId: "session-123",
		sessionName: "Daily work",
		gitBranch: "main",
		gitRepo: "/Users/christian/src/my-repo",
		repoName: "my-repo",
		reason: "resume",
		previousSessionFile: "/tmp/previous-session.jsonl",
	});
});

test("createAgentEndRecord captures turn completion metadata", () => {
	const now = new Date(Date.UTC(2026, 3, 23, 18, 31, 0, 500));
	const record = createAgentEndRecord({
		now,
		cwd: "/Users/christian/dotfiles",
		sessionFile: "/tmp/session.jsonl",
		sessionId: "session-123",
		sessionName: "Daily work",
		gitBranch: "main",
		gitRepo: "/Users/christian/src/my-repo",
		durationMs: 12450,
		messageCount: 3,
	});

	assert.deepEqual(record, {
		type: "agent_end",
		timestamp: "2026-04-23T18:31:00.500Z",
		epochMs: now.getTime(),
		date: formatLocalDate(now),
		utcDate: "2026-04-23",
		cwd: "/Users/christian/dotfiles",
		sessionFile: "/tmp/session.jsonl",
		sessionId: "session-123",
		sessionName: "Daily work",
		gitBranch: "main",
		gitRepo: "/Users/christian/src/my-repo",
		repoName: "my-repo",
		durationMs: 12450,
		durationSeconds: 12.45,
		messageCount: 3,
	});
});
