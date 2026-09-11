import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { buildNotificationArgs, normalizeFocusTarget } from "./notify-done-utils.mjs";

const EXT_DIR = path.dirname(fs.realpathSync(__filename));
const SOUND_PATH = path.resolve(EXT_DIR, "../../../../sounds/done-sound.mp3");
const START_SOUND_PATH = path.resolve(EXT_DIR, "../../../../sounds/im-going-to-help-you.m4a");
const FOCUS_SCRIPT_PATH = path.join(EXT_DIR, "focus-pi-agent.sh");
const OMARCHY_NOTIFICATION_PATH = path.join(
	process.env.OMARCHY_PATH || "/usr/share/omarchy",
	"bin",
	"omarchy-notification-send",
);
const MIN_INTERVAL_MS = 1200;

let lastPlayAt = 0;
let lastNotificationAt = 0;
let warnedMissingFile = false;
let focusTarget: ReturnType<typeof normalizeFocusTarget> = null;

type HyprlandWindow = {
	class?: string;
	address?: string;
};

function isMac(): boolean {
	return process.platform === "darwin";
}

function canPlayNow(): boolean {
	return Date.now() - lastPlayAt >= MIN_INTERVAL_MS;
}

function canNotifyNow(): boolean {
	return Date.now() - lastNotificationAt >= MIN_INTERVAL_MS;
}

function playSound(filePath: string): void {
	if (!isMac()) return;
	if (!fs.existsSync(filePath)) return;
	if (!canPlayNow()) return;

	lastPlayAt = Date.now();
	execFile("afplay", [filePath], () => {
		// Ignore playback errors.
	});
}

function isOmarchyNotificationsAvailable(): boolean {
	return process.platform === "linux" && fs.existsSync(OMARCHY_NOTIFICATION_PATH);
}

async function findActiveKittyWindowAddress(pi: ExtensionAPI): Promise<string | undefined> {
	if (process.platform !== "linux") return undefined;

	const result = await pi.exec("hyprctl", ["activewindow", "-j"], { timeout: 1000 });
	if (result.code !== 0) return undefined;

	try {
		const window = JSON.parse(result.stdout) as HyprlandWindow;
		if (window.class?.toLowerCase() !== "kitty") return undefined;
		return window.address;
	} catch {
		return undefined;
	}
}

async function captureFocusTarget(pi: ExtensionAPI): Promise<void> {
	const windowAddress = await findActiveKittyWindowAddress(pi);
	focusTarget = normalizeFocusTarget({
		session: process.env.ZELLIJ_SESSION_NAME,
		paneId: process.env.ZELLIJ_PANE_ID,
		windowAddress,
	});
}

async function sendOmarchyNotification(pi: ExtensionAPI, ctx: { cwd: string }): Promise<void> {
	if (!isOmarchyNotificationsAvailable() || !canNotifyNow()) return;

	const target = normalizeFocusTarget({
		session: focusTarget?.zellijSession || process.env.ZELLIJ_SESSION_NAME,
		paneId: focusTarget?.paneId || process.env.ZELLIJ_PANE_ID,
		windowAddress: focusTarget?.windowAddress,
	});
	const title = pi.getSessionName()?.trim() || "Pi agent";
	const args = buildNotificationArgs({
		scriptPath: FOCUS_SCRIPT_PATH,
		target,
		title: `Pi finished · ${title}`,
		body: ctx.cwd,
	});

	lastNotificationAt = Date.now();
	const result = await pi.exec("omarchy", ["notification", "send", ...args], { timeout: 5000 });
	if (result.code !== 0) {
		console.error(`notify-done: Omarchy notification failed: ${(result.stderr || result.stdout).trim()}`);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (isMac()) {
			if (fs.existsSync(SOUND_PATH) || warnedMissingFile) return;
			warnedMissingFile = true;
			ctx.ui.notify(`fo-sound extension: missing sound file at ${SOUND_PATH}`, "warning");
			return;
		}

		if (isOmarchyNotificationsAvailable()) await captureFocusTarget(pi);
	});

	// playSound(START_SOUND_PATH);

	pi.on("agent_settled", async (_event, ctx) => {
		// Subagents load global extensions too; only notify for the parent Pi process.
		if (process.env.PI_SUBAGENT_CHILD === "1") return;
		if (!ctx.isIdle()) return;

		if (isOmarchyNotificationsAvailable()) {
			await sendOmarchyNotification(pi, ctx);
			return;
		}

		playSound(SOUND_PATH);
	});
}
