import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type NotifyContext = {
	hasUI?: boolean;
	ui?: { notify: (message: string, level: "info" | "warning" | "error") => void };
};

type ZellijTarget = {
	args: string[];
	successMessage: (id: string | undefined) => string;
};

type ZellijActionSuccess = {
	ok: true;
	stdout: string;
	stderr: string;
};

type ZellijActionFailure = {
	ok: false;
	reason: string;
	message: string;
	stdout?: string;
	stderr?: string;
};

type ZellijActionResult = ZellijActionSuccess | ZellijActionFailure;

type ZellijPane = Record<string, unknown> & {
	id?: number | string;
	is_plugin?: boolean;
	is_focused?: boolean;
	is_floating?: boolean;
	exited?: boolean;
	exit_status?: number | null;
	title?: string;
	tab_id?: number | string;
	tab_position?: number | string;
	tab_name?: string;
	pane_command?: string;
	pane_cwd?: string;
};

type ZellijTab = Record<string, unknown> & {
	tab_id?: number | string;
	position?: number | string;
	name?: string;
	active?: boolean;
	is_fullscreen_active?: boolean;
	is_sync_panes_active?: boolean;
	are_floating_panes_visible?: boolean;
	selectable_tiled_panes_count?: number;
	selectable_floating_panes_count?: number;
};

type TruncationResult = {
	content: string;
	truncated: boolean;
	totalLines: number;
	outputLines: number;
	totalBytes: number;
	outputBytes: number;
};

const REVIEW_TEMPLATE = "/review";
const DEFAULT_MAX_OUTPUT_BYTES = 50 * 1024;
const DEFAULT_MAX_OUTPUT_LINES = 2000;
const HARD_MAX_OUTPUT_BYTES = 200 * 1024;
const HARD_MAX_OUTPUT_LINES = 5000;

function getDefaultShell(): string {
	return process.env.SHELL || "sh";
}

function nu(script: string, options: { login?: boolean } = {}): string[] {
	const login = options.login ?? true;
	return ["nu", ...(login ? ["-l"] : []), "-c", script];
}

function nuString(value: string): string {
	return JSON.stringify(value);
}

function buildReviewPrompt(args: string): string {
	const trimmed = args.trim();
	return trimmed.length > 0 ? `${REVIEW_TEMPLATE} ${trimmed}` : REVIEW_TEMPLATE;
}

function buildCommand(command: string | undefined, useNu: boolean | undefined): string[] {
	if (!command || command.trim().length === 0) return [getDefaultShell()];
	return useNu ?? true ? nu(command) : ["sh", "-lc", command];
}

function buildNewTabArgs(options: { cwd: string; name?: string; command?: string[] }): string[] {
	const args = ["action", "new-tab", "--cwd", options.cwd];
	if (options.name && options.name.trim().length > 0) args.push("--name", options.name.trim());
	args.push("--", ...(options.command ?? [getDefaultShell()]));
	return args;
}

function buildNewPaneArgs(options: {
	cwd: string;
	name?: string;
	direction?: "right" | "down";
	floating?: boolean;
	stacked?: boolean;
	tabId?: number;
	command?: string[];
}): string[] {
	const args = ["action", "new-pane", "--cwd", options.cwd];
	if (options.name && options.name.trim().length > 0) args.push("--name", options.name.trim());
	if (options.tabId !== undefined) args.push("--tab-id", String(options.tabId));
	if (options.floating) args.push("--floating");
	else if (options.stacked) args.push("--stacked");
	else if (options.direction) args.push("--direction", options.direction);
	args.push("--", ...(options.command ?? [getDefaultShell()]));
	return args;
}

function paneIdArgs(paneId: string | undefined): string[] {
	const trimmed = paneId?.trim();
	return trimmed ? ["--pane-id", trimmed] : [];
}

function optionalString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function optionalPositiveInt(value: unknown, fallback: number, hardMax: number): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
	return Math.min(Math.floor(value), hardMax);
}

function numberFrom(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || value.trim().length === 0) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function countLines(text: string): number {
	if (text.length === 0) return 0;
	return text.split(/\r\n|\r|\n/).length;
}

function utf8Prefix(text: string, maxBytes: number): string {
	let bytes = 0;
	let output = "";
	for (const char of text) {
		const charBytes = Buffer.byteLength(char, "utf8");
		if (bytes + charBytes > maxBytes) break;
		bytes += charBytes;
		output += char;
	}
	return output;
}

function truncateHead(text: string, maxLines: number, maxBytes: number): TruncationResult {
	const totalLines = countLines(text);
	const totalBytes = Buffer.byteLength(text, "utf8");
	let content = text;

	if (totalLines > maxLines) {
		content = content.split(/\r\n|\r|\n/).slice(0, maxLines).join("\n");
	}

	if (Buffer.byteLength(content, "utf8") > maxBytes) {
		content = utf8Prefix(content, maxBytes);
	}

	const outputLines = countLines(content);
	const outputBytes = Buffer.byteLength(content, "utf8");

	return {
		content,
		truncated: outputLines < totalLines || outputBytes < totalBytes,
		totalLines,
		outputLines,
		totalBytes,
		outputBytes,
	};
}

function formatTruncationNotice(truncation: TruncationResult): string {
	if (!truncation.truncated) return "";
	return `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines, ${truncation.outputBytes} of ${truncation.totalBytes} bytes.]`;
}

function parseJson<T>(text: string): { ok: true; value: T } | { ok: false; error: string } {
	try {
		return { ok: true, value: JSON.parse(text) as T };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

function paneDisplayId(pane: ZellijPane): string {
	const id = pane.id;
	if (id === undefined || id === null) return "unknown";
	const idString = String(id);
	if (idString.startsWith("terminal_") || idString.startsWith("plugin_")) return idString;
	return `${pane.is_plugin ? "plugin" : "terminal"}_${idString}`;
}

function formatPaneSummary(panes: ZellijPane[]): string {
	if (panes.length === 0) return "No panes found.";
	return panes
		.map((pane) => {
			const flags = [
				pane.is_focused ? "focused" : undefined,
				pane.is_floating ? "floating" : undefined,
				pane.exited ? `exited${pane.exit_status !== undefined && pane.exit_status !== null ? `:${pane.exit_status}` : ""}` : undefined,
			]
				.filter(Boolean)
				.join(", ");
			const tab = pane.tab_name ? `${pane.tab_name} (${pane.tab_id ?? "?"})` : String(pane.tab_id ?? "?");
			const command = pane.pane_command ? ` command=${pane.pane_command}` : "";
			const cwd = pane.pane_cwd ? ` cwd=${pane.pane_cwd}` : "";
			const title = pane.title ? ` ${pane.title}` : "";
			return `${paneDisplayId(pane)} tab=${tab}${flags ? ` [${flags}]` : ""}${title}${command}${cwd}`;
		})
		.join("\n");
}

function formatTabSummary(tabs: ZellijTab[]): string {
	if (tabs.length === 0) return "No tabs found.";
	return tabs
		.map((tab) => {
			const flags = [
				tab.active ? "active" : undefined,
				tab.is_fullscreen_active ? "fullscreen" : undefined,
				tab.is_sync_panes_active ? "sync" : undefined,
				tab.are_floating_panes_visible ? "floating-visible" : undefined,
			]
				.filter(Boolean)
				.join(", ");
			const panes = [
				tab.selectable_tiled_panes_count !== undefined ? `tiled=${tab.selectable_tiled_panes_count}` : undefined,
				tab.selectable_floating_panes_count !== undefined ? `floating=${tab.selectable_floating_panes_count}` : undefined,
			]
				.filter(Boolean)
				.join(" ");
			return `${tab.tab_id ?? "?"} pos=${tab.position ?? "?"} ${tab.name ?? "(unnamed)"}${flags ? ` [${flags}]` : ""}${panes ? ` ${panes}` : ""}`;
		})
		.join("\n");
}

function zellijToolFailure(failure: ZellijActionFailure) {
	return {
		content: [{ type: "text" as const, text: failure.message }],
		details: { ok: false, reason: failure.reason, stdout: failure.stdout, stderr: failure.stderr },
	};
}

function jsonParseFailure(message: string, stdout: string, error: string) {
	return {
		content: [{ type: "text" as const, text: `${message}: ${error}` }],
		details: { ok: false, reason: "invalid_json", stdout },
	};
}

function notify(ctx: NotifyContext, message: string, level: "info" | "warning" | "error" = "info") {
	if (ctx.hasUI && ctx.ui) ctx.ui.notify(message, level);
	else if (level === "error") console.error(message);
	else console.log(message);
}

function ensureInsideZellij(ctx: NotifyContext): boolean {
	if (process.env.ZELLIJ !== undefined) return true;
	notify(ctx, "Not running inside a Zellij session", "error");
	return false;
}

async function runZellijAction(
	pi: ExtensionAPI,
	ctx: NotifyContext,
	args: string[],
	signal?: any,
	timeout = 5000,
): Promise<ZellijActionResult> {
	if (!ensureInsideZellij(ctx)) {
		return { ok: false, reason: "not_in_zellij", message: "Not running inside a Zellij session." };
	}

	const result = await pi.exec("zellij", args, { timeout, signal });
	if (result.code !== 0) {
		const message = (result.stderr || result.stdout || "zellij command failed").trim();
		return { ok: false, reason: "zellij_failed", message, stdout: result.stdout, stderr: result.stderr };
	}

	return { ok: true, stdout: result.stdout, stderr: result.stderr };
}

async function execZellij(
	pi: ExtensionAPI,
	ctx: NotifyContext,
	target: ZellijTarget,
): Promise<string | undefined> {
	if (!ensureInsideZellij(ctx)) return undefined;

	const result = await pi.exec("zellij", target.args, { timeout: 5000 });
	if (result.code !== 0) {
		const details = (result.stderr || result.stdout || "zellij command failed").trim();
		notify(ctx, details, "error");
		return undefined;
	}

	const id = result.stdout.trim() || undefined;
	notify(ctx, target.successMessage(id), "info");
	return id;
}

async function findRepoRoot(pi: ExtensionAPI): Promise<string | null> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { timeout: 5000 });
	if (result.code !== 0) return null;
	const root = result.stdout.trim();
	return root.length > 0 ? root : null;
}

const ZELLIJ_NEW_TAB_PARAMS = {
	type: "object",
	additionalProperties: false,
	properties: {
		cwd: { type: "string", description: "Working directory for the new tab. Defaults to the current Pi cwd." },
		name: { type: "string", description: "Optional Zellij tab name." },
		command: { type: "string", description: "Optional command to run in the new tab. Defaults to the user's shell." },
		useNu: { type: "boolean", description: "Run command through `nu -l -c`. Defaults to true when command is provided." },
	},
} as const;

const ZELLIJ_SPAWN_PI_TAB_PARAMS = {
	type: "object",
	additionalProperties: false,
	required: ["prompt"],
	properties: {
		prompt: { type: "string", description: "Prompt to send to the spawned Pi instance." },
		cwd: { type: "string", description: "Working directory for the new Pi tab. Defaults to the current Pi cwd." },
		name: { type: "string", description: "Optional Zellij tab name. Defaults to `pi`." },
	},
} as const;

const ZELLIJ_LIST_PANES_PARAMS = {
	type: "object",
	additionalProperties: false,
	properties: {
		tabId: { type: "integer", description: "Only include panes in this Zellij tab ID." },
		includePlugins: { type: "boolean", description: "Include plugin panes. Defaults to false." },
		focusedOnly: { type: "boolean", description: "Only include panes marked focused. Defaults to false." },
	},
} as const;

const ZELLIJ_LIST_TABS_PARAMS = {
	type: "object",
	additionalProperties: false,
	properties: {
		activeOnly: { type: "boolean", description: "Only include the active tab. Defaults to false." },
	},
} as const;

const ZELLIJ_CURRENT_TAB_PARAMS = {
	type: "object",
	additionalProperties: false,
	properties: {},
} as const;

const ZELLIJ_READ_PANE_PARAMS = {
	type: "object",
	additionalProperties: false,
	properties: {
		paneId: { type: "string", description: "Pane ID to read, e.g. `terminal_3`. Defaults to the focused pane." },
		full: { type: "boolean", description: "Include full scrollback instead of only the visible viewport. Defaults to false." },
		ansi: { type: "boolean", description: "Preserve ANSI styling. Defaults to false for machine-readable text." },
		maxBytes: {
			type: "integer",
			description: "Maximum UTF-8 bytes to return. Defaults to 50KB; hard-capped at 200KB.",
			minimum: 1,
			maximum: HARD_MAX_OUTPUT_BYTES,
		},
		maxLines: {
			type: "integer",
			description: "Maximum lines to return. Defaults to 2000; hard-capped at 5000.",
			minimum: 1,
			maximum: HARD_MAX_OUTPUT_LINES,
		},
	},
} as const;

const ZELLIJ_WRITE_PANE_PARAMS = {
	type: "object",
	additionalProperties: false,
	required: ["paneId", "text"],
	properties: {
		paneId: { type: "string", description: "Pane ID to write to, e.g. `terminal_3`." },
		text: { type: "string", description: "Text to send to the pane." },
		submit: { type: "boolean", description: "Send Enter after writing the text. Defaults to false." },
		mode: {
			type: "string",
			enum: ["paste", "write-chars"],
			description: "Input mode. `paste` uses bracketed paste and is best for multiline text. Defaults to `paste`.",
		},
	},
} as const;

const ZELLIJ_SEND_KEYS_PARAMS = {
	type: "object",
	additionalProperties: false,
	required: ["paneId", "keys"],
	properties: {
		paneId: { type: "string", description: "Pane ID to send keys to, e.g. `terminal_3`." },
		keys: {
			type: "array",
			minItems: 1,
			items: { type: "string" },
			description: "Key names to send, e.g. [`Enter`], [`Ctrl c`], [`Alt b`, `Enter`].",
		},
	},
} as const;

const ZELLIJ_NEW_PANE_PARAMS = {
	type: "object",
	additionalProperties: false,
	properties: {
		cwd: { type: "string", description: "Working directory for the new pane. Defaults to the current Pi cwd." },
		name: { type: "string", description: "Optional Zellij pane name." },
		direction: { type: "string", enum: ["right", "down"], description: "Open pane to the right or below." },
		floating: { type: "boolean", description: "Open as a floating pane. Conflicts with direction and stacked." },
		stacked: { type: "boolean", description: "Open as a stacked pane. Conflicts with direction and floating." },
		tabId: { type: "integer", description: "Optional target tab ID." },
		command: { type: "string", description: "Optional command to run in the pane. Defaults to the user's shell." },
		useNu: { type: "boolean", description: "Run command through `nu -l -c`. Defaults to true when command is provided." },
	},
} as const;

const ZELLIJ_FOCUS_PANE_PARAMS = {
	type: "object",
	additionalProperties: false,
	required: ["paneId"],
	properties: {
		paneId: { type: "string", description: "Pane ID to focus, e.g. `terminal_3`." },
	},
} as const;

const ZELLIJ_FOCUS_TAB_PARAMS = {
	type: "object",
	additionalProperties: false,
	required: ["tabId"],
	properties: {
		tabId: { type: "integer", description: "Stable Zellij tab ID to focus." },
	},
} as const;

export default function zellijExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "zellij_new_tab",
		label: "Zellij New Tab",
		description: "Open a new Zellij tab, optionally running a command.",
		parameters: ZELLIJ_NEW_TAB_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!ensureInsideZellij(ctx)) {
				return {
					content: [{ type: "text", text: "Not running inside a Zellij session." }],
					details: { ok: false, reason: "not_in_zellij" },
				};
			}

			const cwd = params.cwd?.trim() || ctx.cwd;
			const command = buildCommand(params.command, params.useNu);
			const zellijArgs = buildNewTabArgs({ cwd, name: params.name, command });
			const result = await pi.exec("zellij", zellijArgs, { timeout: 5000, signal });

			if (result.code !== 0) {
				const details = (result.stderr || result.stdout || "zellij command failed").trim();
				return {
					content: [{ type: "text", text: details }],
					details: { ok: false, cwd, name: params.name, command, stderr: result.stderr, stdout: result.stdout },
				};
			}

			const id = result.stdout.trim() || undefined;
			return {
				content: [{ type: "text", text: `Opened new Zellij tab${id ? ` ${id}` : ""}.` }],
				details: { ok: true, id, cwd, name: params.name, command },
			};
		},
	});

	pi.registerTool({
		name: "zellij_spawn_pi_tab",
		label: "Zellij Spawn Pi Tab",
		description: "Open a new Zellij tab running a fresh Pi instance with the provided prompt.",
		parameters: ZELLIJ_SPAWN_PI_TAB_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!ensureInsideZellij(ctx)) {
				return {
					content: [{ type: "text", text: "Not running inside a Zellij session." }],
					details: { ok: false, reason: "not_in_zellij" },
				};
			}

			const prompt = params.prompt.trim();
			if (prompt.length === 0) {
				return {
					content: [{ type: "text", text: "Prompt cannot be empty." }],
					details: { ok: false, reason: "empty_prompt" },
				};
			}

			const cwd = params.cwd?.trim() || ctx.cwd;
			const name = params.name?.trim() || "pi";
			const command = nu(`pi ${nuString(prompt)}`);
			const zellijArgs = buildNewTabArgs({ cwd, name, command });
			const result = await pi.exec("zellij", zellijArgs, { timeout: 5000, signal });

			if (result.code !== 0) {
				const details = (result.stderr || result.stdout || "zellij command failed").trim();
				return {
					content: [{ type: "text", text: details }],
					details: { ok: false, cwd, name, prompt, stderr: result.stderr, stdout: result.stdout },
				};
			}

			const id = result.stdout.trim() || undefined;
			return {
				content: [{ type: "text", text: `Opened Pi Zellij tab${id ? ` ${id}` : ""}.` }],
				details: { ok: true, id, cwd, name, prompt },
			};
		},
	});

	pi.registerTool({
		name: "zellij_list_panes",
		label: "Zellij List Panes",
		description: "List Zellij panes with IDs usable by other Zellij tools.",
		parameters: ZELLIJ_LIST_PANES_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const result = await runZellijAction(pi, ctx, ["action", "list-panes", "--json", "--all"], signal);
			if (result.ok === false) return zellijToolFailure(result);

			const parsed = parseJson<ZellijPane[]>(result.stdout);
			if (parsed.ok === false) return jsonParseFailure("Could not parse Zellij panes JSON", result.stdout, parsed.error);
			if (!Array.isArray(parsed.value)) return jsonParseFailure("Could not parse Zellij panes JSON", result.stdout, "Expected an array");

			let panes = parsed.value;
			if (!params.includePlugins) panes = panes.filter((pane) => !pane.is_plugin);
			if (params.focusedOnly) panes = panes.filter((pane) => pane.is_focused);
			if (params.tabId !== undefined) panes = panes.filter((pane) => numberFrom(pane.tab_id) === params.tabId);

			const summary = formatPaneSummary(panes);
			return {
				content: [{ type: "text", text: summary }],
				details: { ok: true, panes, count: panes.length },
			};
		},
	});

	pi.registerTool({
		name: "zellij_list_tabs",
		label: "Zellij List Tabs",
		description: "List Zellij tabs with stable tab IDs.",
		parameters: ZELLIJ_LIST_TABS_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const result = await runZellijAction(pi, ctx, ["action", "list-tabs", "--json", "--all"], signal);
			if (result.ok === false) return zellijToolFailure(result);

			const parsed = parseJson<ZellijTab[]>(result.stdout);
			if (parsed.ok === false) return jsonParseFailure("Could not parse Zellij tabs JSON", result.stdout, parsed.error);
			if (!Array.isArray(parsed.value)) return jsonParseFailure("Could not parse Zellij tabs JSON", result.stdout, "Expected an array");

			let tabs = parsed.value;
			if (params.activeOnly) tabs = tabs.filter((tab) => tab.active);

			const summary = formatTabSummary(tabs);
			return {
				content: [{ type: "text", text: summary }],
				details: { ok: true, tabs, count: tabs.length },
			};
		},
	});

	pi.registerTool({
		name: "zellij_current_tab",
		label: "Zellij Current Tab",
		description: "Get the current active Zellij tab as JSON.",
		parameters: ZELLIJ_CURRENT_TAB_PARAMS as any,
		async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
			const result = await runZellijAction(pi, ctx, ["action", "current-tab-info", "--json"], signal);
			if (result.ok === false) return zellijToolFailure(result);

			const parsed = parseJson<ZellijTab>(result.stdout);
			if (parsed.ok === false) return jsonParseFailure("Could not parse current Zellij tab JSON", result.stdout, parsed.error);

			return {
				content: [{ type: "text", text: formatTabSummary([parsed.value]) }],
				details: { ok: true, tab: parsed.value },
			};
		},
	});

	pi.registerTool({
		name: "zellij_read_pane",
		label: "Zellij Read Pane",
		description: "Read a Zellij pane's visible screen or full scrollback. Output is truncated by default to 50KB or 2000 lines.",
		parameters: ZELLIJ_READ_PANE_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const paneId = optionalString(params.paneId);
			const full = params.full ?? false;
			const ansi = params.ansi ?? false;
			const maxBytes = optionalPositiveInt(params.maxBytes, DEFAULT_MAX_OUTPUT_BYTES, HARD_MAX_OUTPUT_BYTES);
			const maxLines = optionalPositiveInt(params.maxLines, DEFAULT_MAX_OUTPUT_LINES, HARD_MAX_OUTPUT_LINES);

			const args = ["action", "dump-screen", ...paneIdArgs(paneId)];
			if (full) args.push("--full");
			if (ansi) args.push("--ansi");

			const result = await runZellijAction(pi, ctx, args, signal, full ? 10000 : 5000);
			if (result.ok === false) return zellijToolFailure(result);

			const truncation = truncateHead(result.stdout, maxLines, maxBytes);
			const target = paneId ? `Pane ${paneId}` : "Focused pane";
			return {
				content: [
					{
						type: "text",
						text: `${target} ${full ? "full scrollback" : "screen"}:\n\n${truncation.content}${formatTruncationNotice(truncation)}`,
					},
				],
				details: { ok: true, paneId, full, ansi, ...truncation },
			};
		},
	});

	pi.registerTool({
		name: "zellij_write_pane",
		label: "Zellij Write Pane",
		description: "Write text to a Zellij pane using bracketed paste or write-chars, optionally submitting with Enter.",
		parameters: ZELLIJ_WRITE_PANE_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const paneId = optionalString(params.paneId);
			if (!paneId) {
				return {
					content: [{ type: "text", text: "paneId cannot be empty." }],
					details: { ok: false, reason: "empty_pane_id" },
				};
			}

			const mode = params.mode === "write-chars" ? "write-chars" : "paste";
			const result = await runZellijAction(pi, ctx, ["action", mode, "--pane-id", paneId, "--", params.text], signal);
			if (result.ok === false) return zellijToolFailure(result);

			if (params.submit) {
				const submitResult = await runZellijAction(pi, ctx, ["action", "send-keys", "--pane-id", paneId, "Enter"], signal);
				if (submitResult.ok === false) return zellijToolFailure(submitResult);
			}

			return {
				content: [{ type: "text", text: `Wrote ${params.text.length} character(s) to ${paneId}${params.submit ? " and sent Enter" : ""}.` }],
				details: { ok: true, paneId, mode, submitted: params.submit ?? false, bytes: Buffer.byteLength(params.text, "utf8") },
			};
		},
	});

	pi.registerTool({
		name: "zellij_send_keys",
		label: "Zellij Send Keys",
		description: "Send named keys to a Zellij pane, e.g. Enter, Ctrl c, Alt b, F1.",
		parameters: ZELLIJ_SEND_KEYS_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const paneId = optionalString(params.paneId);
			const keys = params.keys.map((key: string) => key.trim()).filter((key: string) => key.length > 0);
			if (!paneId) {
				return {
					content: [{ type: "text", text: "paneId cannot be empty." }],
					details: { ok: false, reason: "empty_pane_id" },
				};
			}
			if (keys.length === 0) {
				return {
					content: [{ type: "text", text: "At least one key is required." }],
					details: { ok: false, reason: "empty_keys" },
				};
			}

			const result = await runZellijAction(pi, ctx, ["action", "send-keys", "--pane-id", paneId, ...keys], signal);
			if (result.ok === false) return zellijToolFailure(result);

			return {
				content: [{ type: "text", text: `Sent ${keys.length} key(s) to ${paneId}.` }],
				details: { ok: true, paneId, keys },
			};
		},
	});

	pi.registerTool({
		name: "zellij_new_pane",
		label: "Zellij New Pane",
		description: "Open a new Zellij pane, optionally running a command, and return its pane ID.",
		parameters: ZELLIJ_NEW_PANE_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const placementCount = [params.direction, params.floating, params.stacked].filter(Boolean).length;
			if (placementCount > 1) {
				return {
					content: [{ type: "text", text: "Choose only one pane placement: direction, floating, or stacked." }],
					details: { ok: false, reason: "conflicting_placement" },
				};
			}

			const cwd = params.cwd?.trim() || ctx.cwd;
			const command = buildCommand(params.command, params.useNu);
			const zellijArgs = buildNewPaneArgs({
				cwd,
				name: params.name,
				direction: params.direction,
				floating: params.floating,
				stacked: params.stacked,
				tabId: params.tabId,
				command,
			});
			const result = await runZellijAction(pi, ctx, zellijArgs, signal);
			if (result.ok === false) return zellijToolFailure(result);

			const id = result.stdout.trim() || undefined;
			return {
				content: [{ type: "text", text: `Opened new Zellij pane${id ? ` ${id}` : ""}.` }],
				details: { ok: true, id, cwd, name: params.name, command, direction: params.direction, floating: params.floating, stacked: params.stacked, tabId: params.tabId },
			};
		},
	});

	pi.registerTool({
		name: "zellij_focus_pane",
		label: "Zellij Focus Pane",
		description: "Focus a specific Zellij pane by pane ID.",
		parameters: ZELLIJ_FOCUS_PANE_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const paneId = optionalString(params.paneId);
			if (!paneId) {
				return {
					content: [{ type: "text", text: "paneId cannot be empty." }],
					details: { ok: false, reason: "empty_pane_id" },
				};
			}

			const result = await runZellijAction(pi, ctx, ["action", "focus-pane-id", paneId], signal);
			if (result.ok === false) return zellijToolFailure(result);

			return {
				content: [{ type: "text", text: `Focused Zellij pane ${paneId}.` }],
				details: { ok: true, paneId },
			};
		},
	});

	pi.registerTool({
		name: "zellij_focus_tab",
		label: "Zellij Focus Tab",
		description: "Focus a specific Zellij tab by stable tab ID.",
		parameters: ZELLIJ_FOCUS_TAB_PARAMS as any,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const result = await runZellijAction(pi, ctx, ["action", "go-to-tab-by-id", String(params.tabId)], signal);
			if (result.ok === false) return zellijToolFailure(result);

			return {
				content: [{ type: "text", text: `Focused Zellij tab ${params.tabId}.` }],
				details: { ok: true, tabId: params.tabId },
			};
		},
	});

	pi.registerCommand("zt", {
		description: "Open a new Zellij tab in the current directory",
		handler: async (_args, ctx) => {
			await execZellij(pi, ctx, {
				args: buildNewTabArgs({ cwd: ctx.cwd }),
				successMessage: (id) => `Opened new tab${id ? ` ${id}` : ""}`,
			});
		},
	});

	pi.registerCommand("zl", {
		description: "Open a new Zellij pane to the right",
		handler: async (_args, ctx) => {
			await execZellij(pi, ctx, {
				args: ["action", "new-pane", "--direction", "right", "--cwd", ctx.cwd],
				successMessage: (id) => `Opened right pane${id ? ` ${id}` : ""}`,
			});
		},
	});

	pi.registerCommand("zj", {
		description: "Open a new Zellij pane below",
		handler: async (_args, ctx) => {
			await execZellij(pi, ctx, {
				args: ["action", "new-pane", "--direction", "down", "--cwd", ctx.cwd],
				successMessage: (id) => `Opened lower pane${id ? ` ${id}` : ""}`,
			});
		},
	});

	pi.registerCommand("zf", {
		description: "Open a new floating Zellij pane",
		handler: async (_args, ctx) => {
			await execZellij(pi, ctx, {
				args: ["action", "new-pane", "--floating", "--cwd", ctx.cwd],
				successMessage: (id) => `Opened floating pane${id ? ` ${id}` : ""}`,
			});
		},
	});

	pi.registerCommand("nvim", {
		description: "Open nvim in a stacked Zellij pane",
		handler: async (_args, ctx) => {
			await execZellij(pi, ctx, {
				args: ["action", "new-pane", "--stacked", "--cwd", ctx.cwd, "--", "nvim"],
				successMessage: (id) => `Opened stacked nvim pane${id ? ` ${id}` : ""}`,
			});
		},
	});

	pi.registerCommand("gd", {
		description: "Open git diff",
		handler: async (_args, ctx) => {
			await execZellij(pi, ctx, {
				args: ["action", "new-pane", "--stacked", "--close-on-exit", "--cwd", ctx.cwd, "--", ...nu("gd")],
				successMessage: (id) => `Opened stacked git diff pane${id ? ` ${id}` : ""}`,
			});
		},
	});

	pi.registerCommand("zfork", {
		description: "Open a fork of the current Pi session in a new Zellij tab, optionally with an initial prompt",
		handler: async (args, ctx) => {
			if (!ensureInsideZellij(ctx)) return;

			const sessionFile = ctx.sessionManager.getSessionFile();
			if (!sessionFile) {
				notify(ctx, "Cannot /zfork: current session is not persisted.", "error");
				return;
			}

			const prompt = args.trim();
			const command = prompt.length > 0
				? nu(`pi --fork ${nuString(sessionFile)} ${nuString(prompt)}`)
				: nu(`pi --fork ${nuString(sessionFile)}`);

			await execZellij(pi, ctx, {
				args: buildNewTabArgs({ cwd: ctx.cwd, name: "pi-fork", command }),
				successMessage: (id) => `Opened forked Pi tab${id ? ` ${id}` : ""}`,
			});
		},
	});

	pi.registerCommand("zreview", {
		description: "Open a fresh Pi review session in a new Zellij pane, optionally with review arguments",
		handler: async (args, ctx) => {
			if (!ensureInsideZellij(ctx)) return;

			const repoRoot = await findRepoRoot(pi);
			if (!repoRoot) {
				notify(ctx, "zreview requires a git repository", "error");
				return;
			}

			const reviewPrompt = buildReviewPrompt(args);

			await execZellij(pi, ctx, {
				args: [
					"action",
					"new-pane",
					"--direction",
					"right",
					"--cwd",
					repoRoot,
					"--name",
					"review",
					"--",
					...nu(`pi ${nuString(reviewPrompt)}`),
				],
				successMessage: (id) =>
					`Opened review pane${id ? ` ${id}` : ""}${args.trim().length > 0 ? ` for: ${args.trim()}` : ""}`,
			});
		},
	});
}
