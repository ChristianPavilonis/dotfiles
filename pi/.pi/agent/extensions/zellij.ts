import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

type ZellijTarget = {
	args: string[];
	successMessage: (id: string | undefined) => string;
};

const REVIEW_TEMPLATE = "/zreview-worktree";

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "warning" | "error" = "info") {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else if (level === "error") console.error(message);
	else console.log(message);
}

function ensureInsideZellij(ctx: ExtensionCommandContext): boolean {
	if (process.env.ZELLIJ !== undefined) return true;
	notify(ctx, "Not running inside a Zellij session", "error");
	return false;
}

async function execZellij(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	target: ZellijTarget,
): Promise<void> {
	if (!ensureInsideZellij(ctx)) return;

	const result = await pi.exec("zellij", target.args, { timeout: 5000 });
	if (result.code !== 0) {
		const details = (result.stderr || result.stdout || "zellij command failed").trim();
		notify(ctx, details, "error");
		return;
	}

	const id = result.stdout.trim() || undefined;
	notify(ctx, target.successMessage(id), "info");
}

async function findRepoRoot(pi: ExtensionAPI): Promise<string | null> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { timeout: 5000 });
	if (result.code !== 0) return null;
	const root = result.stdout.trim();
	return root.length > 0 ? root : null;
}

export default function zellijExtension(pi: ExtensionAPI) {
	pi.registerCommand("zt", {
		description: "Open a new Zellij tab in the current directory",
		handler: async (_args, ctx) => {
			await execZellij(pi, ctx, {
				args: ["action", "new-tab", "--cwd", ctx.cwd],
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

	pi.registerCommand("zreview", {
		description: "Open a fresh Pi review session in a new Zellij pane",
		handler: async (_args, ctx) => {
			if (!ensureInsideZellij(ctx)) return;

			const repoRoot = await findRepoRoot(pi);
			if (!repoRoot) {
				notify(ctx, "zreview requires a git repository", "error");
				return;
			}

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
					"pi",
					REVIEW_TEMPLATE,
				],
				successMessage: (id) => `Opened review pane${id ? ` ${id}` : ""}`,
			});
		},
	});
}
