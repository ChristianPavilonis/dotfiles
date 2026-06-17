import { completeSimple } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const TITLE_PROVIDER = "openai-codex";
const TITLE_MODEL = "gpt-5.3-codex-spark";
const STATUS_KEY = "session-title";
const MAX_TITLE_LENGTH = 60;

type SessionEntryLike = {
	type?: string;
	name?: string;
	message?: {
		role?: string;
	};
};

type MessageLike = {
	role?: string;
	content?: unknown;
};

let disposed = false;
let sessionGeneration = 0;
let generationStarted = false;
let initialUserMessageCount = 0;
let warnedMissingModel = false;
let warnedAuth = false;

function countUserMessages(ctx: ExtensionContext): number {
	return ctx.sessionManager
		.getBranch()
		.filter((entry: SessionEntryLike) => entry.type === "message" && entry.message?.role === "user").length;
}

function hasExplicitSessionName(ctx: ExtensionContext): boolean {
	return ctx.sessionManager
		.getEntries()
		.some((entry: SessionEntryLike) => entry.type === "session_info" && typeof entry.name === "string" && entry.name.trim().length > 0);
}

function extractMessageText(message: MessageLike): string {
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.filter((part): part is { type: "text"; text: string } =>
			Boolean(part) && typeof part === "object" && part.type === "text" && typeof part.text === "string",
		)
		.map((part) => part.text)
		.join("\n");
}

function extractText(response: { content?: Array<{ type: string; text?: string }> }): string {
	return (response.content ?? [])
		.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

function fallbackTitle(firstPrompt: string): string {
	return firstPrompt
		.replace(/[`*_#>\[\](){}]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.slice(0, 6)
		.join(" ");
}

function clampTitle(title: string): string {
	if (title.length <= MAX_TITLE_LENGTH) return title;

	const truncated = title.slice(0, MAX_TITLE_LENGTH).trim();
	const lastSpace = truncated.lastIndexOf(" ");
	if (lastSpace >= 30) {
		return truncated.slice(0, lastSpace).trim();
	}
	return truncated;
}

function sanitizeTitle(rawTitle: string, firstPrompt: string): string | undefined {
	let title = rawTitle
		.split("\n")
		.map((line) => line.trim())
		.find(Boolean);

	if (!title) {
		title = fallbackTitle(firstPrompt);
	}

	title = title
		.replace(/^title\s*:\s*/i, "")
		.replace(/\s+/g, " ")
		.trim();

	// Remove common wrapping punctuation from model output.
	title = title.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
	title = title.replace(/[.。]+$/g, "").trim();
	title = clampTitle(title);

	return title.length > 0 ? title : undefined;
}

async function generateSessionTitle(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	firstPrompt: string,
	generation: number,
): Promise<void> {
	const model = ctx.modelRegistry.find(TITLE_PROVIDER, TITLE_MODEL);
	if (!model) {
		if (ctx.hasUI && !warnedMissingModel) {
			warnedMissingModel = true;
			ctx.ui.notify(`Session title model not found: ${TITLE_PROVIDER}/${TITLE_MODEL}`, "warning");
		}
		return;
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) {
		if (ctx.hasUI && !warnedAuth) {
			warnedAuth = true;
			ctx.ui.notify(auth.ok ? `No auth for ${TITLE_PROVIDER}/${TITLE_MODEL}` : auth.error, "warning");
		}
		return;
	}

	if (ctx.hasUI) {
		ctx.ui.setStatus(STATUS_KEY, "naming session…");
	}

	try {
		const response = await completeSimple(
			model,
			{
				systemPrompt:
					"You generate concise Pi coding-agent session titles. Return only the title: 2-6 words, no quotes, no markdown, no trailing period, maximum 60 characters.",
				messages: [
					{
						role: "user" as const,
						content: [
							{
								type: "text" as const,
								text: `Create a concise session title for this first user message:\n\n${firstPrompt}`,
							},
						],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				maxTokens: 80,
				reasoning: "minimal",
				temperature: 0.2,
				timeoutMs: 30_000,
			},
		);

		if (disposed || generation !== sessionGeneration || hasExplicitSessionName(ctx)) return;
		if (response.stopReason === "error") return;

		const title = sanitizeTitle(extractText(response), firstPrompt);
		if (!title) return;

		pi.setSessionName(title);
	} finally {
		if (!disposed && generation === sessionGeneration && ctx.hasUI) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
		}
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		disposed = false;
		sessionGeneration += 1;
		generationStarted = false;
		initialUserMessageCount = countUserMessages(ctx);
	});

	pi.on("session_shutdown", () => {
		disposed = true;
		sessionGeneration += 1;
	});

	pi.on("message_end", (event, ctx) => {
		if (generationStarted) return;
		if (initialUserMessageCount > 0) return;
		if (hasExplicitSessionName(ctx)) return;

		const message = event.message as MessageLike;
		if (message.role !== "user") return;

		const firstPrompt = extractMessageText(message).trim();
		if (!firstPrompt) return;

		generationStarted = true;
		const generation = sessionGeneration;
		void generateSessionTitle(pi, ctx, firstPrompt, generation).catch((error) => {
			if (disposed || generation !== sessionGeneration) return;
			if (ctx.hasUI) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Session title generation failed: ${message}`, "warning");
				ctx.ui.setStatus(STATUS_KEY, undefined);
			}
		});
	});
}
