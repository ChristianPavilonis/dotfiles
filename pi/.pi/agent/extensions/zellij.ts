import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type NotifyContext = {
	hasUI?: boolean;
	ui?: { notify: (message: string, level: "info" | "warning" | "error") => void };
};

type ZellijTarget = {
	args: string[];
	successMessage: (id: string | undefined) => string;
};

const REVIEW_TEMPLATE = "/review";

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

export default function zellijExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "zellij_new_tab",
		label: "Zellij New Tab",
		description: "Open a new Zellij tab, optionally running a command.",
		parameters: ZELLIJ_NEW_TAB_PARAMS,
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
		parameters: ZELLIJ_SPAWN_PI_TAB_PARAMS,
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
				args: ["action", "new-pane", "--stacked", "--cwd", ctx.cwd, "--", ...nu("gd")],
				successMessage: (id) => `Opened stacked git diff pane${id ? ` ${id}` : ""}`,
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
