import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const STATE_VERSION = 1;
export const DEFAULT_STATE_DIR = path.join(os.homedir(), ".cache", "pi-zellij-agents");

export function getStateDir(env = process.env) {
	if (env.PI_ZELLIJ_AGENT_STATE_DIR) return env.PI_ZELLIJ_AGENT_STATE_DIR;
	if (env.XDG_CACHE_HOME) return path.join(env.XDG_CACHE_HOME, "pi-zellij-agents");
	return DEFAULT_STATE_DIR;
}

export function normalizePaneId(paneId) {
	const trimmed = String(paneId ?? "").trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("terminal_")) return trimmed;
	if (/^\d+$/.test(trimmed)) return `terminal_${trimmed}`;
	return null;
}

export function getRecordPath(stateDir, zellijSession, paneId) {
	const key = createHash("sha256")
		.update(`${zellijSession}\0${paneId}`)
		.digest("hex")
		.slice(0, 24);
	return path.join(stateDir, `${key}.json`);
}

export function createAgentRecord({
	now = new Date(),
	ownerId,
	pid,
	zellijSession,
	paneId,
	piSessionId,
	cwd,
	title,
	state = "idle",
}) {
	const timestamp = now.toISOString();
	const epochMs = now.getTime();
	return {
		version: STATE_VERSION,
		ownerId,
		pid,
		zellijSession,
		paneId,
		piSessionId: piSessionId ?? null,
		cwd,
		title: title ?? null,
		state,
		stateChangedAt: epochMs,
		updatedAt: epochMs,
		idleAt: state === "idle" ? epochMs : null,
		busyAt: state === "busy" ? epochMs : null,
		timestamp,
	};
}

export function updateAgentRecord(record, patch, { now = new Date(), stateChanged = false } = {}) {
	const epochMs = now.getTime();
	const next = {
		...record,
		...patch,
		updatedAt: epochMs,
		timestamp: now.toISOString(),
	};

	if (stateChanged) next.stateChangedAt = epochMs;
	if (patch.state === "idle") next.idleAt = epochMs;
	if (patch.state === "busy") next.busyAt = epochMs;
	return next;
}

export async function writeAgentRecordAtomic(recordPath, record) {
	await mkdir(path.dirname(recordPath), { recursive: true, mode: 0o700 });
	const temporaryPath = `${recordPath}.${record.ownerId}.${process.pid}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
	await rename(temporaryPath, recordPath);
}

export async function removeAgentRecordIfOwned(recordPath, ownerId) {
	let record;
	try {
		record = JSON.parse(await readFile(recordPath, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") return false;
		throw error;
	}

	if (record?.ownerId !== ownerId) return false;
	try {
		await unlink(recordPath);
		return true;
	} catch (error) {
		if (error?.code === "ENOENT") return false;
		throw error;
	}
}
