import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 10 * 60_000;

const NUSHELL_PARAMS = {
	type: "object",
	additionalProperties: false,
	required: ["command"],
	properties: {
		command: {
			type: "string",
			description: "Nushell command/script to run via `nu -c`. Use for commands that need Nushell aliases, functions, overlays, or syntax.",
		},
		cwd: {
			type: "string",
			description: "Working directory for the command. Defaults to the current Pi cwd.",
		},
		login: {
			type: "boolean",
			description: "Run Nushell as a login shell with `nu -l -c`. Defaults to true so user aliases/functions are loaded.",
		},
		timeoutMs: {
			type: "number",
			description: "Timeout in milliseconds. Defaults to 30000. Capped at 600000.",
		},
	},
} as const;

function clampTimeout(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
	return Math.min(Math.floor(value), MAX_TIMEOUT_MS);
}

function buildNuArgs(command: string, login: boolean): string[] {
	return [...(login ? ["-l"] : []), "-c", command];
}

export default function nushellExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "nushell",
		label: "Nushell",
		description:
			"Execute a Nushell command. Prefer this over bash when using Nushell aliases/functions like `gwa`, `gws`, `gwpr`, or Nushell-specific syntax.",
		parameters: NUSHELL_PARAMS,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const command = params.command.trim();
			if (command.length === 0) {
				return {
					content: [{ type: "text", text: "Command cannot be empty." }],
					details: { ok: false, reason: "empty_command" },
				};
			}

			const cwd = params.cwd?.trim() || ctx.cwd;
			const login = params.login ?? true;
			const timeout = clampTimeout(params.timeoutMs);
			const args = buildNuArgs(command, login);
			const result = await pi.exec("nu", args, { cwd, timeout, signal });

			const stdout = result.stdout.trimEnd();
			const stderr = result.stderr.trimEnd();
			const textParts = [];
			if (stdout.length > 0) textParts.push(stdout);
			if (stderr.length > 0) textParts.push(`stderr:\n${stderr}`);
			if (textParts.length === 0) textParts.push(`Command exited with code ${result.code}.`);

			return {
				content: [{ type: "text", text: textParts.join("\n\n") }],
				details: {
					ok: result.code === 0,
					command,
					cwd,
					login,
					timeoutMs: timeout,
					code: result.code,
					killed: result.killed,
					stdout: result.stdout,
					stderr: result.stderr,
				},
			};
		},
	});
}
