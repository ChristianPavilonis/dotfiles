import { normalizePaneId } from "./zellij-agent-state-utils.mjs";

const KITTY_WINDOW_ADDRESS = /^0x[0-9a-f]+$/i;

export function normalizeFocusTarget({ session, paneId, windowAddress } = {}) {
	const target = {};
	const zellijSession = String(session ?? "").trim();
	const normalizedPaneId = normalizePaneId(paneId);
	const normalizedWindowAddress = String(windowAddress ?? "").trim();

	if (zellijSession && normalizedPaneId) {
		target.zellijSession = zellijSession;
		target.paneId = normalizedPaneId;
	}
	if (KITTY_WINDOW_ADDRESS.test(normalizedWindowAddress)) target.windowAddress = normalizedWindowAddress;

	return Object.keys(target).length > 0 ? target : null;
}

export function buildNotificationArgs({ scriptPath, target, title, body }) {
	const args = [
		"--app-name",
		"pi",
		"-g",
		"",
		"-u",
		"low",
		"-t",
		"10000",
		String(title),
		String(body),
	];

	if (target) {
		args.push(
			"--exec",
			"/bin/bash",
			scriptPath,
			target.zellijSession ?? "",
			target.paneId ?? "",
			target.windowAddress ?? "",
		);
	}

	return args;
}
