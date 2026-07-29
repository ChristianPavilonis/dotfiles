import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
	createAgentRecord,
	getRecordPath,
	getStateDir,
	normalizePaneId,
	removeAgentRecordIfOwned,
	updateAgentRecord,
	writeAgentRecordAtomic,
} from "./zellij-agent-state-utils.mjs";

test("normalizePaneId accepts terminal IDs and bare numeric IDs", () => {
	assert.equal(normalizePaneId("terminal_647"), "terminal_647");
	assert.equal(normalizePaneId("647"), "terminal_647");
	assert.equal(normalizePaneId("plugin_3"), null);
	assert.equal(normalizePaneId(""), null);
});

test("getStateDir honors explicit and XDG cache directories", () => {
	assert.equal(getStateDir({ PI_ZELLIJ_AGENT_STATE_DIR: "/tmp/custom" }), "/tmp/custom");
	assert.equal(getStateDir({ XDG_CACHE_HOME: "/tmp/cache" }), "/tmp/cache/pi-zellij-agents");
});

test("agent records preserve transition timestamps", () => {
	const started = new Date("2026-07-28T20:00:00.000Z");
	const busyAt = new Date("2026-07-28T20:01:00.000Z");
	const idleAt = new Date("2026-07-28T20:02:00.000Z");
	const initial = createAgentRecord({
		now: started,
		ownerId: "owner-a",
		pid: 123,
		zellijSession: "dotfiles",
		paneId: "terminal_7",
		piSessionId: "pi-session",
		cwd: "/repo",
		title: "Initial title",
	});
	const busy = updateAgentRecord(initial, { state: "busy" }, { now: busyAt, stateChanged: true });
	const idle = updateAgentRecord(busy, { state: "idle" }, { now: idleAt, stateChanged: true });

	assert.equal(initial.idleAt, started.getTime());
	assert.equal(busy.busyAt, busyAt.getTime());
	assert.equal(busy.idleAt, started.getTime());
	assert.equal(idle.idleAt, idleAt.getTime());
	assert.equal(idle.stateChangedAt, idleAt.getTime());
});

test("atomic writes and owner-checked removal protect replacement records", async () => {
	const stateDir = await mkdtemp(path.join(os.tmpdir(), "pi-zellij-agent-state-"));
	try {
		const recordPath = getRecordPath(stateDir, "dotfiles", "terminal_7");
		const original = createAgentRecord({
			ownerId: "owner-a",
			pid: 123,
			zellijSession: "dotfiles",
			paneId: "terminal_7",
			piSessionId: "pi-session",
			cwd: "/repo",
			title: null,
		});
		await writeAgentRecordAtomic(recordPath, original);
		assert.deepEqual(JSON.parse(await readFile(recordPath, "utf8")), original);

		await writeFile(recordPath, `${JSON.stringify({ ...original, ownerId: "owner-b" })}\n`);
		assert.equal(await removeAgentRecordIfOwned(recordPath, "owner-a"), false);
		assert.equal(await removeAgentRecordIfOwned(recordPath, "owner-b"), true);
	} finally {
		await rm(stateDir, { recursive: true, force: true });
	}
});
