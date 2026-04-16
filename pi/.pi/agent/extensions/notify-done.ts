import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EXT_DIR = path.dirname(fs.realpathSync(__filename));
const SOUND_PATH = path.resolve(EXT_DIR, "../../../../sounds/done-sound.mp3");
const START_SOUND_PATH = path.resolve(EXT_DIR, "../../../../sounds/im-going-to-help-you.m4a");
const MIN_INTERVAL_MS = 1200;

let lastPlayAt = 0;
let warnedMissingFile = false;

function isMac(): boolean {
	return process.platform === "darwin";
}

function canPlayNow(): boolean {
	return Date.now() - lastPlayAt >= MIN_INTERVAL_MS;
}

function playSound(path): void {
	if (!isMac()) return;
	if (!fs.existsSync(path)) return;
	if (!canPlayNow()) return;

	lastPlayAt = Date.now();
	execFile("afplay", [path], () => {
		// Ignore playback errors.
	});
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!isMac()) return;
		if (fs.existsSync(SOUND_PATH) || warnedMissingFile) return;
		warnedMissingFile = true;
		ctx.ui.notify(`fo-sound extension: missing sound file at ${SOUND_PATH}`, "warning");
	});

	playSound(START_SOUND_PATH);

	pi.on("agent_end", async () => {
		playSound(SOUND_PATH);
	});
}
