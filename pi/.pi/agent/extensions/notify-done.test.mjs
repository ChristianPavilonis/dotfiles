import test from "node:test";
import assert from "node:assert/strict";

import { buildNotificationArgs, normalizeFocusTarget } from "./notify-done-utils.mjs";

test("normalizeFocusTarget keeps a Zellij pane and Kitty window together", () => {
	assert.deepEqual(
		normalizeFocusTarget({
			session: "trusted-server",
			paneId: "54",
			windowAddress: "0x55a3b069f8c0",
		}),
		{
			zellijSession: "trusted-server",
			paneId: "terminal_54",
			windowAddress: "0x55a3b069f8c0",
		},
	);
});

test("normalizeFocusTarget fails closed for invalid pane and window identifiers", () => {
	assert.equal(
		normalizeFocusTarget({ session: "trusted-server", paneId: "plugin_3", windowAddress: "not-an-address" }),
		null,
	);
	assert.equal(normalizeFocusTarget({}), null);
});

test("buildNotificationArgs passes click-target values as separate argv entries", () => {
	const args = buildNotificationArgs({
		scriptPath: "/home/pav/dotfiles/pi/.pi/agent/extensions/focus-pi-agent.sh",
		target: normalizeFocusTarget({
			session: "session; still-data",
			paneId: "7",
			windowAddress: "0xabc",
		}),
		title: "Pi finished",
		body: "/tmp/project; not shell syntax",
	});

	assert.deepEqual(args.slice(-6), [
		"--exec",
		"/bin/bash",
		"/home/pav/dotfiles/pi/.pi/agent/extensions/focus-pi-agent.sh",
		"session; still-data",
		"terminal_7",
		"0xabc",
	]);
	assert.equal(args.includes("/tmp/project; not shell syntax"), true);
});
