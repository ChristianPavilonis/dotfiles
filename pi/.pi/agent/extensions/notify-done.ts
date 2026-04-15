import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EXT_DIR = path.dirname(fs.realpathSync(__filename));
const SOUND_PATH = path.resolve(EXT_DIR, "../../../../fo-sound.mp3");
const MIN_INTERVAL_MS = 1200;

let lastPlayAt = 0;
let warnedMissingFile = false;

function isMac(): boolean {
	return process.platform === "darwin";
}

function canPlayNow(): boolean {
	return Date.now() - lastPlayAt >= MIN_INTERVAL_MS;
}

function playSound(): void {
	if (!isMac()) return;
	if (!fs.existsSync(SOUND_PATH)) return;
	if (!canPlayNow()) return;

	lastPlayAt = Date.now();
	execFile("afplay", [SOUND_PATH], () => {
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

	pi.on("turn_end", async () => {
		playSound();
	});

	pi.on("agent_end", async () => {
		playSound();
	});
}
