import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";

import {
	createAgentRecord,
	getRecordPath,
	getStateDir,
	normalizePaneId,
	removeAgentRecordIfOwned,
	updateAgentRecord,
	writeAgentRecordAtomic,
} from "./zellij-agent-state-utils.mjs";

type AgentState = "busy" | "idle";

type AgentRecord = ReturnType<typeof createAgentRecord>;

export default function zellijAgentStateExtension(pi: ExtensionAPI) {
	const zellijSession = process.env.ZELLIJ_SESSION_NAME?.trim();
	const paneId = normalizePaneId(process.env.ZELLIJ_PANE_ID);
	const isSubagent = process.env.PI_SUBAGENT_CHILD === "1";
	const ownerId = randomUUID();
	const stateDir = getStateDir();
	const recordPath = zellijSession && paneId ? getRecordPath(stateDir, zellijSession, paneId) : null;

	let currentRecord: AgentRecord | null = null;
	let trackingEnabled = false;
	let operationQueue = Promise.resolve();
	let warnedWriteFailure = false;

	function warnOnce(ctx: ExtensionContext, error: unknown): void {
		if (warnedWriteFailure) return;
		warnedWriteFailure = true;
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) ctx.ui.notify(`zellij-agent-state: ${message}`, "warning");
		else console.error(`zellij-agent-state: ${message}`);
	}

	function enqueue(ctx: ExtensionContext, operation: () => Promise<void>): Promise<void> {
		const queued = operationQueue.then(operation);
		operationQueue = queued.catch((error) => warnOnce(ctx, error));
		return operationQueue;
	}

	function transition(ctx: ExtensionContext, state: AgentState): Promise<void> {
		if (!trackingEnabled || !currentRecord || !recordPath) return Promise.resolve();
		return enqueue(ctx, async () => {
			if (!currentRecord) return;
			currentRecord = updateAgentRecord(currentRecord, { state }, { stateChanged: true });
			await writeAgentRecordAtomic(recordPath, currentRecord);
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		trackingEnabled = Boolean(!isSubagent && recordPath && zellijSession && paneId && ctx.mode === "tui");
		if (!trackingEnabled || !recordPath || !zellijSession || !paneId) return;

		await enqueue(ctx, async () => {
			currentRecord = createAgentRecord({
				ownerId,
				pid: process.pid,
				zellijSession,
				paneId,
				piSessionId: ctx.sessionManager.getSessionId(),
				cwd: ctx.cwd,
				title: pi.getSessionName(),
				state: ctx.isIdle() ? "idle" : "busy",
			});
			await writeAgentRecordAtomic(recordPath, currentRecord);
		});
	});

	pi.on("agent_start", async (_event, ctx) => {
		await transition(ctx, "busy");
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!ctx.isIdle()) return;
		await transition(ctx, "idle");
	});

	pi.on("session_info_changed", async (event, ctx) => {
		if (!trackingEnabled || !currentRecord || !recordPath) return;
		await enqueue(ctx, async () => {
			if (!currentRecord) return;
			currentRecord = updateAgentRecord(currentRecord, { title: event.name ?? null });
			await writeAgentRecordAtomic(recordPath, currentRecord);
		});
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (!recordPath || !trackingEnabled) return;
		trackingEnabled = false;
		await enqueue(ctx, async () => {
			await removeAgentRecordIfOwned(recordPath, ownerId);
			currentRecord = null;
		});
	});
}
