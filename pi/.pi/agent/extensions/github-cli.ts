import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "warning" | "error" = "info") {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else if (level === "error") console.error(message);
	else console.log(message);
}

function parseArgs(args: string): string[] {
	const trimmed = args.trim();
	return trimmed.length > 0 ? trimmed.split(/\s+/) : [];
}

async function execGh(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: string[],
	successMessage: string,
): Promise<void> {
	const result = await pi.exec("gh", args, { timeout: 10000 });
	if (result.code !== 0) {
		const details = (result.stderr || result.stdout || "gh command failed").trim();
		notify(ctx, details, "error");
		return;
	}

	notify(ctx, successMessage, "info");
}

export default function githubCliExtension(pi: ExtensionAPI) {
	pi.registerCommand("ghpr", {
		description: "Open GitHub pull request view in the browser",
		handler: async (args, ctx) => {
			await execGh(
				pi,
				ctx,
				["pr", "view", ...parseArgs(args), "--web"],
				"Opened pull request in browser",
			);
		},
	});

	pi.registerCommand("ghrepo", {
		description: "Open GitHub repository view in the browser",
		handler: async (args, ctx) => {
			await execGh(
				pi,
				ctx,
				["repo", "view", ...parseArgs(args), "--web"],
				"Opened repository in browser",
			);
		},
	});
}
