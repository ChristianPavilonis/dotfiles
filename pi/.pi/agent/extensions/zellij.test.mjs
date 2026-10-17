import test from "node:test";
import assert from "node:assert/strict";

import zellijExtension from "./zellij.ts";

function harness({
	panes = [{ id: 7, is_plugin: true, tab_id: 99 }, { id: 7, is_plugin: false, tab_id: 0 }],
	tabs = [{ tab_id: 0, active: true }],
	listCode = 0, beforeExec = async () => {}, entries = [], sessionId = "session-1",
} = {}) {
	const tools = new Map();
	const commands = new Map();
	const events = new Map();
	const calls = [];
	const failures = { create: false, stack: false, focus: false };
	let nextId = Math.max(42, ...(Array.isArray(panes) ? panes.filter((p) => !p.is_plugin).map((p) => Number(p.id) + 1) : []));
	const pi = {
		on: (name, handler) => events.set(name, handler),
		registerTool: (tool) => tools.set(tool.name, tool),
		registerCommand: (name, command) => commands.set(name, command),
		async exec(command, args, options) {
			calls.push({ command, args, options });
			const intercepted = await beforeExec(args);
			if (intercepted) return intercepted;
			if (args[1] === "list-tabs") return { code: 0, stdout: JSON.stringify(tabs), stderr: "" };
			if (args[1] === "list-panes") return { code: listCode, stdout: typeof panes === "string" ? panes : JSON.stringify(panes), stderr: listCode ? "query failed" : "" };
			if (args[1] === "new-pane") {
				if (failures.create) return { code: 1, stdout: "", stderr: "creation failed" };
				const id = nextId++;
				const tabId = Number(args[args.indexOf("--tab-id") + 1]);
				if (Array.isArray(panes)) {
					for (const pane of panes) if (pane.tab_id === tabId) pane.is_focused = false;
					panes.push({ id, is_plugin: false, tab_id: tabId, is_floating: args.includes("--floating"), is_focused: true });
				}
				if (Array.isArray(tabs)) for (const tab of tabs) tab.active = tab.tab_id === tabId;
				return { code: 0, stdout: `terminal_${id}\n`, stderr: "" };
			}
			if (args[1] === "stack-panes" && failures.stack) return { code: 1, stdout: "", stderr: "stack failed" };
			if (args[1] === "focus-pane-id") {
				if (failures.focus) return { code: 1, stdout: "", stderr: "focus failed" };
				const target = panes.find((pane) => `${pane.is_plugin ? "plugin" : "terminal"}_${pane.id}` === args[2]);
				assert.ok(target, "focus target must exist");
				for (const pane of panes) if (pane.tab_id === target.tab_id) pane.is_focused = pane === target;
			}
			if (args[1] === "go-to-tab-by-id") {
				for (const tab of tabs) tab.active = tab.tab_id === Number(args[2]);
			}
			return { code: 0, stdout: command === "git" ? "/tmp/repo\n" : "", stderr: "" };
		},
	};
	zellijExtension(pi);
	const ctx = {
		cwd: "/tmp/project",
		hasUI: true,
		ui: { notify() {} },
		sessionManager: { getSessionFile: () => "/tmp/session.jsonl", getSessionId: () => sessionId, getEntries: () => entries },
	};
	async function create(params = {}) {
		const result = await tools.get("zellij_new_pane").execute("call", params, undefined, undefined, ctx);
		entries.push({ type: "message", message: { role: "toolResult", toolName: "zellij_new_pane", details: result.details } });
		return result;
	}
	return { tools, commands, calls, ctx, create, panes, tabs, failures, entries, events };
}

async function insideZellij(run) {
	const previous = { ZELLIJ: process.env.ZELLIJ, ZELLIJ_PANE_ID: process.env.ZELLIJ_PANE_ID };
	process.env.ZELLIJ = "0";
	process.env.ZELLIJ_PANE_ID = "7";
	try {
		await run();
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

for (const placement of [{}, { direction: "right" }, { direction: "down" }, { floating: true }, { stacked: true }]) {
	test(`new pane defaults to its owning tab: ${JSON.stringify(placement)}`, () => insideZellij(async () => {
		const { tools, calls, ctx } = harness();
		const result = await tools.get("zellij_new_pane").execute("call", placement, undefined, undefined, ctx);
		assert.equal(result.details.ok, true);
		const args = calls.find((call) => call.args[1] === "new-pane").args;
		assert.equal(args[args.indexOf("--tab-id") + 1], "0");
		assert.equal(result.details.tabId, 0);
	}));
}

for (const tabId of [0, 23]) {
	test(`explicit tab ${tabId} overrides calling-pane placement`, () => insideZellij(async () => {
		const { tools, calls, ctx } = harness();
		const result = await tools.get("zellij_new_pane").execute("call", { tabId, direction: "right" }, undefined, undefined, ctx);
		assert.equal(result.details.ok, true);
		const args = calls[0].args;
		assert.equal(args[args.indexOf("--tab-id") + 1], String(tabId));
		assert.equal(calls.length, 1, "explicit target skips pane lookup");
	}));
}

for (const [name, args] of [
	["zl", ""], ["zj", ""], ["zf", ""], ["nvim", ""], ["gd", ""], ["zreview", "HEAD"],
	...["h", "j", "k", "l"].map((placement) => ["zfork", `${placement} continue`]),
]) {
	test(`/${name} ${args} opens in its owning tab`, () => insideZellij(async () => {
		const { commands, calls, ctx } = harness();
		await commands.get(name).handler(args, ctx);
		const create = calls.find((call) => call.command === "zellij" && call.args[1] === "new-pane");
		assert.ok(create, "command should create a pane");
		assert.equal(create.args[create.args.indexOf("--tab-id") + 1], "0");
	}));
}

test("owning tab is resolved again after Pi's pane moves", () => insideZellij(async () => {
	const panes = [{ id: 7, is_plugin: false, tab_id: 0 }];
	const { tools, calls, ctx } = harness({ panes });
	const tool = tools.get("zellij_new_pane");
	await tool.execute("first", {}, undefined, undefined, ctx);
	panes[0].tab_id = 12;
	const result = await tool.execute("second", {}, undefined, undefined, ctx);
	assert.equal(result.details.tabId, 12);
	assert.equal(calls.filter((call) => call.args[1] === "list-panes").length, 2);
}));

for (const [name, options] of [
	["missing owning pane", { panes: [] }],
	["plugin with the same ID", { panes: [{ id: 7, is_plugin: true, tab_id: 99 }] }],
	["invalid tab ID", { panes: [{ id: 7, is_plugin: false, tab_id: -1 }] }],
	["invalid JSON", { panes: "not JSON" }],
	["non-array JSON", { panes: "{}" }],
	["failed pane query", { listCode: 1 }],
]) {
	test(`${name} fails without opening a pane on the user's focused tab`, () => insideZellij(async () => {
		const { tools, calls, ctx } = harness(options);
		await assert.rejects(tools.get("zellij_new_pane").execute("call", {}, undefined, undefined, ctx));
		assert.ok(!calls.some((call) => call.args[1] === "new-pane"));
	}));
}

for (const paneId of [undefined, "", "bad-id"]) {
	test(`invalid owning pane environment ${JSON.stringify(paneId)} requires an explicit tab`, () => insideZellij(async () => {
		if (paneId === undefined) delete process.env.ZELLIJ_PANE_ID;
		else process.env.ZELLIJ_PANE_ID = paneId;
		const { tools, calls, ctx } = harness();
		const tool = tools.get("zellij_new_pane");
		await assert.rejects(tool.execute("default", {}, undefined, undefined, ctx), /explicit tabId/);
		assert.equal(calls.length, 0);
		const result = await tool.execute("explicit", { tabId: 0, direction: "right" }, undefined, undefined, ctx);
		assert.equal(result.details.ok, true);
	}));
}

test("new tabs do not receive pane placement flags", () => insideZellij(async () => {
	const { tools, commands, calls, ctx } = harness();
	await tools.get("zellij_new_tab").execute("call", {}, undefined, undefined, ctx);
	await tools.get("zellij_spawn_pi_tab").execute("call", { prompt: "hello" }, undefined, undefined, ctx);
	await commands.get("zt").handler("", ctx);
	await commands.get("zfork").handler("t continue", ctx);
	for (const call of calls) {
		assert.equal(call.args[1], "new-tab");
		assert.ok(!call.args.includes("--near-current-pane"));
	}
}));

test("conflicting pane placement fails without running Zellij", () => insideZellij(async () => {
	const { tools, calls, ctx } = harness();
	const result = await tools.get("zellij_new_pane").execute("call", { direction: "right", floating: true }, undefined, undefined, ctx);
	assert.equal(result.details.reason, "conflicting_placement");
	assert.equal(calls.length, 0);
}));

function stackCalls(h) { return h.calls.filter((call) => call.args[1] === "stack-panes").map((call) => call.args.slice(3)); }
function createCalls(h) { return h.calls.filter((call) => call.args[1] === "new-pane").map((call) => call.args); }

test("automatic panes open right first, then join one owned stack", () => insideZellij(async () => {
	const h = harness();
	const first = await h.create();
	const second = await h.create();
	const third = await h.create();
	const args = createCalls(h)[0];
	assert.equal(args[args.indexOf("--direction") + 1], "right");
	assert.deepEqual(stackCalls(h), [[first.details.id, second.details.id], [first.details.id, second.details.id, third.details.id]]);
	assert.equal(third.details.stacked, true);
}));

for (const placement of [{ direction: "right" }, { direction: "down" }, { floating: true }, { stacked: true }]) {
	test(`explicit placement ${JSON.stringify(placement)} does not join the automatic stack`, () => insideZellij(async () => {
		const h = harness();
		const first = await h.create();
		await h.create(placement);
		const last = await h.create();
		assert.deepEqual(stackCalls(h), [[first.details.id, last.details.id]]);
	}));
}

test("automatic groups are separate for each target tab", () => insideZellij(async () => {
	const h = harness();
	const first = await h.create();
	const elsewhere = await h.create({ tabId: 23 });
	const second = await h.create();
	const elsewhereSecond = await h.create({ tabId: 23 });
	assert.deepEqual(stackCalls(h), [[first.details.id, second.details.id], [elsewhere.details.id, elsewhereSecond.details.id]]);
}));

test("closing the first pane keeps stacking on the surviving panes", () => insideZellij(async () => {
	const h = harness();
	const first = await h.create();
	const second = await h.create();
	h.panes.splice(h.panes.findIndex((p) => `terminal_${p.id}` === first.details.id), 1);
	const third = await h.create();
	assert.deepEqual(stackCalls(h).at(-1), [second.details.id, third.details.id]);
}));

for (const change of ["closed", "moved", "floating"]) {
	test(`${change} owned pane starts a fresh right-hand group`, () => insideZellij(async () => {
		const h = harness();
		const first = await h.create();
		const index = h.panes.findIndex((p) => `terminal_${p.id}` === first.details.id);
		if (change === "closed") h.panes.splice(index, 1);
		else if (change === "moved") h.panes[index].tab_id = 23;
		else h.panes[index].is_floating = true;
		await h.create();
		assert.equal(stackCalls(h).length, 0);
		const args = createCalls(h).at(-1);
		assert.equal(args[args.indexOf("--direction") + 1], "right");
	}));
}

test("failed creation does not become an owned pane", () => insideZellij(async () => {
	const h = harness();
	h.failures.create = true;
	assert.equal((await h.create()).details.ok, false);
	h.failures.create = false;
	await h.create();
	assert.equal(stackCalls(h).length, 0);
	const args = createCalls(h).at(-1);
	assert.equal(args[args.indexOf("--direction") + 1], "right");
}));

test("failed stacking reports the existing pane and retains it for the next join", () => insideZellij(async () => {
	const h = harness();
	const first = await h.create();
	h.failures.stack = true;
	const second = await h.create();
	assert.equal(second.details.reason, "stack_failed");
	assert.ok(second.details.id);
	assert.match(second.content[0].text, /was created/);
	h.failures.stack = false;
	const third = await h.create();
	assert.deepEqual(stackCalls(h).at(-1), [first.details.id, second.details.id, third.details.id]);
	assert.equal(createCalls(h).length, 3);
}));

test("concurrent automatic creation is serialized", () => insideZellij(async () => {
	let release;
	const blocked = new Promise((resolve) => { release = resolve; });
	let started;
	const firstStarted = new Promise((resolve) => { started = resolve; });
	let creates = 0;
	const h = harness({ beforeExec: async (args) => {
		if (args[1] === "new-pane" && ++creates === 1) { started(); await blocked; }
	} });
	const first = h.create();
	await firstStarted;
	const second = h.create();
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(creates, 1, "second creation must wait for the first");
	release();
	const results = await Promise.all([first, second]);
	assert.deepEqual(stackCalls(h), [results.map((result) => result.details.id)]);
}));

test("reload restores serialized groups for the same Pi process and session", () => insideZellij(async () => {
	const h = harness();
	const first = await h.create();
	const restored = harness({ panes: h.panes, entries: JSON.parse(JSON.stringify(h.entries)) });
	await restored.events.get("session_start")({}, restored.ctx);
	const second = await restored.create();
	assert.deepEqual(stackCalls(restored), [[first.details.id, second.details.id]]);
}));

test("a rejected operation does not block subsequent creation", () => insideZellij(async () => {
	let fail = true;
	const h = harness({ beforeExec: async () => {
		if (fail) { fail = false; throw new Error("query aborted"); }
	} });
	await assert.rejects(h.create(), /query aborted/);
	assert.equal((await h.create()).details.ok, true);
}));

test("unknown created pane ID is reported without claiming a group", () => insideZellij(async () => {
	let fail = true;
	const h = harness({ beforeExec: async (args) => {
		if (fail && args[1] === "new-pane") { fail = false; return { code: 0, stdout: "", stderr: "" }; }
	} });
	const result = await h.create();
	assert.equal(result.details.reason, "invalid_pane_id");
	assert.match(result.content[0].text, /Do not recreate/);
	await h.create();
	assert.equal(stackCalls(h).length, 0);
}));

test("restored group can never include Pi's own pane", () => insideZellij(async () => {
	const h = harness();
	const first = await h.create();
	h.entries[0].message.details.paneGroup.paneIds.unshift("terminal_7");
	const restored = harness({ panes: h.panes, entries: h.entries });
	await restored.events.get("session_start")({}, restored.ctx);
	const second = await restored.create();
	assert.deepEqual(stackCalls(restored), [[first.details.id, second.details.id]]);
}));

function focusHarness(options = {}) {
	return harness({
		panes: [
			{ id: 7, is_plugin: false, tab_id: 0, is_focused: true },
			{ id: 8, is_plugin: false, tab_id: 23, is_focused: true },
		],
		tabs: [{ tab_id: 0, active: false }, { tab_id: 23, active: true }],
		...options,
	});
}

for (const placement of [{}, { direction: "right" }, { floating: true }, { stacked: true }, { tabId: 0, direction: "down" }]) {
	test(`noFocus restores the user's pane in another tab: ${JSON.stringify(placement)}`, () => insideZellij(async () => {
		const h = focusHarness();
		const result = await h.create({ ...placement, noFocus: true });
		assert.equal(result.details.ok, true);
		assert.equal(h.tabs.find((tab) => tab.active).tab_id, 23);
		assert.equal(h.panes.find((pane) => pane.id === 8).is_focused, true);
		assert.deepEqual(h.calls.at(-2).args, ["action", "focus-pane-id", "terminal_8"]);
		assert.deepEqual(h.calls.at(-1).args, ["action", "go-to-tab-by-id", "23"]);
	}));
}

test("noFocus restores focus after stacking and concurrent creation", () => insideZellij(async () => {
	const h = focusHarness();
	const results = await Promise.all([h.create({ noFocus: true }), h.create({ noFocus: true }), h.create({ noFocus: true })]);
	assert.ok(results.every((result) => result.details.ok));
	assert.deepEqual(h.calls.filter((call) => call.args[1] === "focus-pane-id").map((call) => call.args[2]), ["terminal_8", "terminal_8", "terminal_8"]);
	assert.equal(h.calls.at(-3).args[1], "stack-panes");
	assert.equal(h.calls.at(-2).args[1], "focus-pane-id");
	assert.equal(h.calls.at(-1).args[1], "go-to-tab-by-id");
}));

test("noFocus preserves a different pane in Pi's own tab", () => insideZellij(async () => {
	const h = focusHarness();
	h.panes[0].is_focused = false;
	h.panes[1].tab_id = 0;
	h.tabs[0].active = true;
	h.tabs[1].active = false;
	assert.equal((await h.create({ noFocus: true })).details.ok, true);
	assert.equal(h.panes.find((pane) => pane.id === 8).is_focused, true);
}));

test("noFocus can restore a focused plugin", () => insideZellij(async () => {
	const h = focusHarness();
	h.panes[1].is_plugin = true;
	assert.equal((await h.create({ noFocus: true })).details.ok, true);
	assert.equal(h.calls.at(-2).args[2], "plugin_8");
}));

for (const noFocus of [undefined, false]) {
	test(`noFocus=${noFocus} retains normal creation focus`, () => insideZellij(async () => {
		const h = focusHarness();
		assert.equal((await h.create({ noFocus })).details.ok, true);
		assert.equal(h.tabs.find((tab) => tab.active).tab_id, 0);
		assert.ok(!h.calls.some((call) => ["list-tabs", "focus-pane-id"].includes(call.args[1])));
	}));
}

for (const failure of ["create", "stack"]) {
	test(`noFocus restores focus on ${failure} failure`, () => insideZellij(async () => {
		const h = focusHarness();
		await h.create({ noFocus: true });
		h.failures[failure] = true;
		const result = await h.create({ noFocus: true });
		assert.equal(result.details.ok, false);
		if (failure === "stack") assert.ok(result.details.id);
		assert.equal(h.tabs.find((tab) => tab.active).tab_id, 23);
		assert.equal(h.calls.at(-2).args[1], "focus-pane-id");
	}));
}

for (const throws of [false, true]) {
	test(`noFocus reports restore failure without losing the created pane, throws=${throws}`, () => insideZellij(async () => {
		const h = focusHarness({ beforeExec: async (args) => {
			if (throws && args[1] === "focus-pane-id") throw new Error("focus threw");
		} });
		h.failures.focus = true;
		const result = await h.create({ noFocus: true });
		assert.equal(result.details.reason, "focus_restore_failed");
		assert.equal(result.isError, true);
		assert.ok(result.details.id);
		assert.ok(result.details.paneGroup);
		assert.match(result.content.at(-1).text, /Do not recreate/);
		assert.equal(createCalls(h).length, 1);
	}));
}

for (const options of [{ tabs: "bad" }, { tabs: [] }, { panes: "bad" }, { panes: [] }, { listCode: 1 }]) {
	test(`noFocus fails before creation if focus cannot be captured: ${JSON.stringify(options)}`, () => insideZellij(async () => {
		const h = focusHarness(options);
		try { await h.create({ noFocus: true }); } catch (error) { assert.match(error.message, /focused Zellij pane/); }
		assert.equal(createCalls(h).length, 0);
	}));
}

test("noFocus reports tab restoration failure with the created pane ID", () => insideZellij(async () => {
	const h = focusHarness({ beforeExec: async (args) => {
		if (args[1] === "go-to-tab-by-id") return { code: 1, stdout: "", stderr: "tab disappeared" };
	} });
	const result = await h.create({ noFocus: true });
	assert.equal(result.details.reason, "focus_restore_failed");
	assert.equal(result.details.focusError, "tab disappeared");
	assert.ok(result.details.id);
}));

test("noFocus restores focus on cancelled stacking without losing the created pane", () => insideZellij(async () => {
	const controller = new AbortController();
	const h = focusHarness({ beforeExec: async (args) => {
		if (args[1] === "stack-panes") { controller.abort(); throw new Error("stack aborted"); }
	} });
	await h.create({ noFocus: true });
	const tool = h.tools.get("zellij_new_pane");
	const result = await tool.execute("call", { noFocus: true }, controller.signal, undefined, h.ctx);
	assert.equal(result.details.reason, "stack_failed");
	assert.ok(result.details.id);
	assert.equal(h.calls.at(-2).options.signal, undefined);
	assert.equal(h.calls.at(-1).options.signal, undefined);
	assert.equal(h.tabs.find((tab) => tab.active).tab_id, 23);
}));

test("noFocus restores focus without the cancelled signal when creation throws", () => insideZellij(async () => {
	const controller = new AbortController();
	const h = focusHarness({ beforeExec: async (args) => {
		if (args[1] === "new-pane") { controller.abort(); throw new Error("creation aborted"); }
	} });
	const tool = h.tools.get("zellij_new_pane");
	await assert.rejects(tool.execute("call", { noFocus: true }, controller.signal, undefined, h.ctx), /creation aborted/);
	assert.equal(h.calls.at(-2).args[1], "focus-pane-id");
	assert.equal(h.calls.at(-2).options.signal, undefined);
	assert.equal(h.calls.at(-1).options.signal, undefined);
	assert.equal(h.tabs.find((tab) => tab.active).tab_id, 23);
}));

test("a new Pi session does not adopt another session's group", () => insideZellij(async () => {
	const h = harness();
	await h.create();
	const fresh = harness({ panes: h.panes, entries: h.entries, sessionId: "session-2" });
	await fresh.events.get("session_start")({}, fresh.ctx);
	await fresh.create();
	assert.equal(stackCalls(fresh).length, 0);
	const args = createCalls(fresh)[0];
	assert.equal(args[args.indexOf("--direction") + 1], "right");
}));
