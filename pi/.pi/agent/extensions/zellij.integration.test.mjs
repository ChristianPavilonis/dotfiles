import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import zellijExtension from "./zellij.ts";

const execFileAsync = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

// Opt in because this needs Zellij and util-linux script, and starts a temporary session.
test("automatic panes form one owned stack despite unrelated focus", {
	skip: process.env.PI_ZELLIJ_INTEGRATION_TEST !== "1",
	timeout: 30000,
}, async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-zellij-stack-"));
	const session = `pi-stack-test-${process.pid}`;
	const env = { ...process.env, TERM: "xterm-256color" };
	for (const key of Object.keys(env)) if (key.startsWith("ZELLIJ")) delete env[key];
	const savedEnv = Object.fromEntries(["ZELLIJ", "ZELLIJ_SESSION_NAME", "ZELLIJ_PANE_ID"].map((key) => [key, process.env[key]]));
	Object.assign(process.env, { ZELLIJ: "0", ZELLIJ_SESSION_NAME: session, ZELLIJ_PANE_ID: "0" });
	const callerEnv = { ...env, ZELLIJ: "0", ZELLIJ_SESSION_NAME: session, ZELLIJ_PANE_ID: "0" };
	await writeFile(join(dir, "config.kdl"), "show_startup_tips false\nshow_release_notes false\nsession_serialization false\n");
	await writeFile(join(dir, "layout.kdl"), 'layout {\n  pane command="sleep" {\n    args "240"\n  }\n}\n');
	const command = `stty rows 40 cols 120; exec zellij -c ${shellQuote(join(dir, "config.kdl"))} -s ${session} -n ${shellQuote(join(dir, "layout.kdl"))}`;
	const client = spawn("script", ["-q", "-c", command, "/dev/null"], { env, stdio: ["pipe", "ignore", "ignore"] });
	let launchError;
	client.on("error", (error) => { launchError = error; });

	async function exec(command, args) {
		try {
			const result = await execFileAsync(command, args, { env: callerEnv, timeout: 5000 });
			return { ...result, code: 0 };
		} catch (error) {
			if (typeof error.code !== "number") throw error;
			return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
		}
	}
	async function action(...args) {
		const result = await exec("zellij", ["action", ...args]);
		assert.equal(result.code, 0, result.stderr || result.stdout);
		return result.stdout.trim();
	}
	async function panes() { return JSON.parse(await action("list-panes", "--json", "--all")); }
	async function waitFor(check) {
		for (let i = 0; i < 100; i++) {
			if (launchError) throw launchError;
			const result = await check();
			if (result) return result;
			await delay(50);
		}
		throw new Error("Timed out waiting for the temporary Zellij session");
	}
	const entries = [];
	const ctx = {
		cwd: dir, hasUI: true, ui: { notify() {} },
		sessionManager: { getSessionId: () => "integration-session", getEntries: () => entries },
	};
	function load() {
		const tools = new Map();
		const events = new Map();
		zellijExtension({ registerTool: (tool) => tools.set(tool.name, tool), registerCommand() {}, on: (name, handler) => events.set(name, handler), exec });
		return { tool: tools.get("zellij_new_pane"), events };
	}
	let extension = load();
	let expectedFocus;
	async function create(params = {}) {
		const result = await extension.tool.execute("check", { name: "auto-stack-check", command: "sleep 240", useNu: false, noFocus: true, ...params }, undefined, undefined, ctx);
		assert.equal(result.details.ok, true, JSON.stringify(result));
		entries.push({ type: "message", message: { role: "toolResult", toolName: "zellij_new_pane", details: result.details } });
		if (expectedFocus) await waitFor(async () => {
			const tabs = JSON.parse(await action("list-tabs", "--json", "--all"));
			const activeTab = tabs.find((tab) => tab.active);
			const focused = (await panes()).find((pane) => pane.tab_id === activeTab?.tab_id && pane.is_focused);
			return focused && `terminal_${focused.id}` === expectedFocus;
		});
		return result.details.id;
	}
	function terminal(rows, id) { return rows.find((pane) => !pane.is_plugin && `terminal_${pane.id}` === id); }
	async function assertStack(ids) {
		const rows = await waitFor(async () => {
			const rows = await panes();
			return ids.every((id) => terminal(rows, id)) ? rows : undefined;
		});
		const grouped = ids.map((id) => terminal(rows, id));
		assert.ok(grouped.every((p) => p.tab_id === 0 && !p.is_floating));
		assert.ok(grouped.every((p) => p.pane_x === grouped[0].pane_x && p.pane_columns === grouped[0].pane_columns), JSON.stringify(grouped));
		if (ids.length > 1) assert.equal(grouped.filter((p) => p.pane_rows === 1).length, ids.length - 1, "stack must collapse every pane except the active one");
		const piPane = terminal(rows, "terminal_0");
		assert.ok(grouped[0].pane_x > piPane.pane_x, "owned stack must remain to the right of Pi");
		assert.equal(piPane.pane_columns, 60, "joining the stack must not shrink Pi");
		assert.equal(piPane.pane_rows, 40, "Pi must not be included in the stack");
	}

	try {
		await waitFor(async () => {
			const result = await exec("zellij", ["list-sessions", "--short"]);
			return result.code === 0 && result.stdout.split("\n").includes(session);
		});
		await waitFor(async () => terminal(await panes(), "terminal_0"));
		const otherTab = Number(await action("new-tab", "--name", "unrelated", "--", "sleep", "240"));
		await action("go-to-tab-by-id", String(otherTab));
		expectedFocus = `terminal_${(await panes()).find((pane) => pane.tab_id === otherTab && pane.is_focused).id}`;
		const first = await create();
		await assertStack([first]);
		// Select Pi, not its tool pane, then switch away before each later request.
		await action("focus-pane-id", "terminal_0");
		await action("go-to-tab-by-id", String(otherTab));
		const second = await create();
		await assertStack([first, second]);
		await action("focus-pane-id", "terminal_0");
		await action("go-to-tab-by-id", String(otherTab));
		const third = await create();
		await assertStack([first, second, third]);

		extension = load();
		await extension.events.get("session_start")({ reason: "reload" }, ctx);
		const fourth = await create();
		await assertStack([first, second, third, fourth]);
		await action("close-pane", "--pane-id", first);
		const fifth = await create();
		await assertStack([second, third, fourth, fifth]);
		for (const id of [second, third, fourth, fifth]) await action("close-pane", "--pane-id", id);
		const fresh = await create();
		await assertStack([fresh]);
		// Exercise the real queued path, without waiting for each creation individually.
		const concurrent = await Promise.all([create(), create()]);
		await assertStack([fresh, ...concurrent]);

		// Also preserve a different pane in the same tab, not just focus in another tab.
		await action("go-to-tab-by-id", "0");
		await action("focus-pane-id", "terminal_0");
		expectedFocus = "terminal_0";
		await create();
		await action("focus-pane-id", fresh);
		expectedFocus = fresh;
		await create({ direction: "down" });
		await create({ floating: true });
		expectedFocus = undefined;
		const foreground = await create({ noFocus: false, direction: "down" });
		await waitFor(async () => terminal(await panes(), foreground)?.is_focused);
	} finally {
		await exec("zellij", ["kill-session", session]).catch(() => {});
		client.stdin.end();
		client.kill("SIGTERM");
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		await rm(dir, { recursive: true, force: true });
	}
});
