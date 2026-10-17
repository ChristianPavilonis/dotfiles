import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exists, freeze, json, loadTarget, send, sourcePath, stateRoot } from "./core.mjs";

const extensionDir = dirname(fileURLToPath(import.meta.url));

export default function sessionHandoff(pi: ExtensionAPI) {
	let pending: { target: any; sessionId: string } | undefined;
	let busy = false;
	const guard = async (ctx: ExtensionContext) => {
		const path = sourcePath(stateRoot(), ctx.sessionManager.getSessionId());
		if (busy || pending !== undefined) return true;
		try { return await exists(path) && (await json(path)).status === "frozen"; }
		catch { return true; } // An unreadable ownership record must not allow continuation.
	};
	const notify = (ctx: ExtensionContext, text: string, level: "info" | "error" = "info") => {
		if (ctx.hasUI) ctx.ui.notify(text, level);
		else console.error(text);
	};
	async function transfer(ctx: ExtensionContext, bundle: any) {
		const receipt = await send(bundle, extensionDir);
		notify(ctx, `Handoff confirmed: ${JSON.stringify(receipt)}. Source is shutting down.`);
		ctx.shutdown();
	}
	async function start(ctx: ExtensionContext, target: any) {
		if (busy) throw new Error("Handoff already in progress");
		busy = true;
		try {
			const bundle = await freeze(ctx, target, extensionDir);
			notify(ctx, `Source frozen. Transfer ${bundle.id}. Recovery record: ${sourcePath(stateRoot(), bundle.sessionId)}`);
			await transfer(ctx, bundle);
		} catch (error) {
			notify(ctx, `${error instanceof Error ? error.message : error}\nIf the source was frozen, keep it stopped and use /handoff retry. Do not continue on both machines.`, "error");
		} finally { busy = false; }
	}
	pi.registerTool({
		name: "session_handoff",
		label: "Session handoff",
		description: "Hand this existing conversation to a configured SSH target, default homelab. First commit only the intended changes. This checks a clean worktree, pushes the current branch, then transfers finalized history after the run settles and shuts down the source on confirmation. Do not continue work after requesting handoff. Failures may freeze source continuation; the user retries with /handoff retry.",
		parameters: { type: "object", additionalProperties: false, properties: { target: { type: "string", description: "Machine-local handoff.json target name. Default homelab." } } } as any,
		async execute(_id, params, _signal, _update, ctx) {
			if (await guard(ctx)) throw new Error("Handoff pending or source frozen. Use /handoff retry.");
			const target = await loadTarget(params.target || "homelab");
			pending = { target, sessionId: ctx.sessionManager.getSessionId() };
			return { content: [{ type: "text", text: "Handoff queued for agent_settled. This result will be included in the finalized snapshot. Stop work here." }], details: { target: target.name }, terminate: true };
		},
	});
	pi.on("agent_settled", async (_event, ctx) => {
		if (!pending) return;
		const request = pending;
		pending = undefined;
		if (request.sessionId !== ctx.sessionManager.getSessionId()) return;
		await start(ctx, request.target);
	});
	pi.registerCommand("handoff", {
		description: "Transfer this session to a configured target: /handoff [homelab|target|retry]",
		handler: async (args, ctx) => {
			try {
				if (!ctx.isIdle() || ctx.hasPendingMessages() || busy || pending) throw new Error("Wait for the current run and queued work to settle first");
				if (args.trim() === "retry") {
					const record = await json(sourcePath(stateRoot(), ctx.sessionManager.getSessionId()));
					if (record.status !== "frozen") throw new Error("No frozen outgoing handoff to retry");
					busy = true;
					try { await transfer(ctx, record.bundle); } finally { busy = false; }
				} else await start(ctx, await loadTarget(args.trim() || "homelab"));
			} catch (error) { notify(ctx, String(error), "error"); }
		},
	});
	pi.on("input", async (_event, ctx) => {
		if (await guard(ctx)) {
			notify(ctx, "This source session is frozen or handing off. Use /handoff retry, or /quit. See the recovery docs before releasing a frozen session.", "error");
			return { action: "handled" as const };
		}
	});
	pi.on("tool_call", async (_event, ctx) => {
		if (await guard(ctx)) return { block: true, reason: "Source session is frozen or handing off" };
	});
	pi.on("user_bash", async (_event, ctx) => {
		if (await guard(ctx)) return { result: { output: "Source session is frozen or handing off", exitCode: 1, cancelled: false, truncated: false } };
	});
	pi.on("before_agent_start", async (_event, ctx) => {
		if (await guard(ctx)) { ctx.abort(); throw new Error("Source session is frozen or handing off"); }
	});
	pi.on("session_start", async (_event, ctx) => {
		pending = undefined;
		if (await guard(ctx)) notify(ctx, "This source session is frozen. Use /handoff retry or /quit; do not continue it locally.", "error");
	});
}
