import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import extension from "./session-handoff/index.ts";
import { snapshot, validateSnapshot, freeze, receive, send, run, digest, sourcePath, json, exists, loadTarget, pull, exportFrozen } from "./session-handoff/core.mjs";

process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";
const extensionDir = join(dirname(fileURLToPath(import.meta.url)), "session-handoff");
const lines = (entries) => entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
const entry = (id, parentId, message) => ({ type: "message", id, parentId, timestamp: "2026-10-16T00:00:00.000Z", message });
function manager(header, entries, leaf = entries.at(-1)?.id) {
	return { getHeader: () => header, getEntries: () => entries, getLeafId: () => leaf, getSessionId: () => header.id };
}
async function fixture(t) {
	const dir = await mkdtemp(join(tmpdir(), "pi-handoff-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const git = (cwd, ...args) => run("git", ["-C", cwd, ...args]);
	const source = join(dir, "source ' ; $ space"), origin = join(dir, "origin ' ; $.git");
	await run("git", ["init", "--bare", "--initial-branch=main", origin]);
	await run("git", ["init", "--initial-branch=main", source]);
	await git(source, "config", "user.email", "fixture@example.invalid");
	await git(source, "config", "user.name", "Fixture");
	await writeFile(join(source, "file"), "initial");
	await git(source, "add", "file");
	await git(source, "commit", "-m", "initial");
	await git(source, "remote", "add", "origin", origin);
	const branch = "feature/quote'$;";
	await git(source, "checkout", "-b", branch);
	const header = { type: "session", version: 3, id: "fixture-session", timestamp: "2026-10-16T00:00:00.000Z", cwd: source };
	const entries = [entry("u", null, { role: "user", content: "handoff" }),
		entry("a", "u", { role: "assistant", content: [{ type: "toolCall", id: "call", name: "session_handoff", arguments: {} }], stopReason: "toolUse" }),
		entry("r", "a", { role: "toolResult", toolCallId: "call", toolName: "session_handoff", content: [{ type: "text", text: "queued" }] })];
	const sessionFile = join(dir, "source.jsonl");
	await writeFile(sessionFile, lines([header, ...entries]));
	const sm = { ...manager(header, entries), getSessionFile: () => sessionFile };
	const ctx = { cwd: source, sessionManager: sm, hasPendingMessages: () => false, model: { provider: "fixture", id: "offline" } };
	const target = { name: "homelab", host: "user@homelab", repo: join(dir, "destination.git"), worktree: join(dir, "dest ' ; $ space"), extension: extensionDir };
	const sourceRoot = join(dir, "source-state"), destRoot = join(dir, "dest-state");
	const tabs = [], calls = [];
	let loseLaunch = false, auth = true, failLaunch = false;
	const exec = async (command, args) => {
		calls.push({ command, args });
		if (command === "pi") {
			if (args[0] === "auth" && !auth) throw new Error("secret credential diagnostic");
			return "fixture";
		}
		assert.equal(command, "zellij");
		if (args.includes("list-tabs")) return JSON.stringify(tabs);
		if (args.includes("new-tab")) {
			if (failLaunch) throw new Error("could not send request");
			tabs.push({ name: args[args.indexOf("--name") + 1], tab_id: tabs.length + 1 });
			if (loseLaunch) throw new Error("lost launch acknowledgement");
			return String(tabs.length);
		}
		return "";
	};
	return { dir, source, origin, branch, git, ctx, target, sourceRoot, destRoot, entries, header, exec, tabs, calls,
		freeze: () => freeze(ctx, target, extensionDir, sourceRoot), receive: (bundle) => receive(bundle, { root: destRoot, exec }),
		set loseLaunch(value) { loseLaunch = value; }, set auth(value) { auth = value; }, set failLaunch(value) { failLaunch = value; } };
}
const resign = (bundle) => { const { id, ...rest } = bundle; return { ...rest, id: digest(JSON.stringify(rest)) }; };

test("snapshot pins selected branch, includes finalized memory-only results, and keeps historical paths", () => {
	const header = { type: "session", version: 3, id: "s", cwd: "/old" };
	const entries = [entry("u", null, { role: "user", content: "/old/file" }),
		entry("selected", "u", { role: "assistant", content: [], stopReason: "stop" }),
		entry("other", "u", { role: "assistant", content: [{ type: "text", text: "other branch" }], stopReason: "stop" })];
	const parsed = validateSnapshot(snapshot(manager(header, entries, "selected"), "/new"));
	assert.equal(parsed.header.cwd, "/new");
	assert.equal(parsed.branch.at(-2).id, "selected");
	assert.equal(parsed.entries.length, 4);
	assert.equal(parsed.entries[0].message.content, "/old/file");
	assert.throws(() => validateSnapshot(lines([header, entry("a", null, { role: "assistant", content: [{ type: "toolCall", id: "unfinished" }] })])), /unfinished/);
	assert.throws(() => validateSnapshot(snapshot(manager(header, entries), "/new").slice(0, -1)), /Truncated/);
});

test("prepare pushes exact code; receive publishes privately and launches once; retry keeps advanced file", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	assert.equal((await json(sourcePath(f.sourceRoot, bundle.sessionId))).status, "frozen");
	assert.equal((await f.git(f.origin, "rev-parse", `refs/heads/${f.branch}`)), bundle.code.commit);
	const receipt = await f.receive(bundle);
	assert.equal(await readFile(receipt.sessionFile, "utf8"), bundle.session);
	assert.equal(await f.git(f.target.worktree, "rev-parse", "HEAD"), bundle.code.commit);
	const launch = f.calls.find((call) => call.args.includes("new-tab"));
	assert.ok(launch.args.includes(f.target.worktree));
	assert.ok(launch.args.at(-1).includes(bundle.code.commit));
	assert.ok(launch.args.at(-1).includes(f.source));
	await writeFile(receipt.sessionFile, "advanced independently");
	assert.deepEqual(await f.receive(bundle), receipt);
	assert.equal(f.tabs.length, 1);
	assert.equal(await readFile(receipt.sessionFile, "utf8"), "advanced independently");
});

test("dirty source and failed push never freeze or launch", async (t) => {
	const f = await fixture(t);
	await writeFile(join(f.source, "unrelated"), "not intended");
	await assert.rejects(f.freeze(), /dirty/);
	assert.equal(await exists(sourcePath(f.sourceRoot, f.header.id)), false);
	await rm(join(f.source, "unrelated"));
	await f.git(f.source, "remote", "set-url", "origin", join(f.dir, "missing.git"));
	await assert.rejects(f.freeze(), /push|failed/);
	assert.equal(await exists(sourcePath(f.sourceRoot, f.header.id)), false);
	assert.equal(f.tabs.length, 0);
});

test("truncated/corrupt transfers and incompatible repos cannot launch", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	await assert.rejects(f.receive(resign({ ...bundle, session: bundle.session.slice(0, -10) })), /checksum/);
	const session = bundle.session.slice(0, -10);
	await assert.rejects(f.receive(resign({ ...bundle, session, checksum: digest(session) })), /Truncated/);
	await run("git", ["init", "--bare", f.target.repo]);
	await f.git(f.target.repo, "remote", "add", "origin", "https://example.invalid/unrelated.git");
	await assert.rejects(f.receive(bundle), /Incompatible/);
	assert.equal(f.tabs.length, 0);
});

test("dirty destination and divergent destination branch are refused", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	await run("git", ["clone", f.origin, f.target.worktree]);
	await f.git(f.target.worktree, "checkout", f.branch);
	// Use this clone itself as the destination repository.
	const next = resign({ ...bundle, target: { ...bundle.target, repo: f.target.worktree } });
	await writeFile(join(f.target.worktree, "dirty"), "unrelated");
	await assert.rejects(f.receive(next), /dirty/);
	await rm(join(f.target.worktree, "dirty"));
	await f.git(f.target.worktree, "config", "user.email", "fixture@example.invalid");
	await f.git(f.target.worktree, "config", "user.name", "Fixture");
	await f.git(f.target.worktree, "commit", "--allow-empty", "-m", "independent commit");
	await assert.rejects(f.receive(next), /failed/);
	assert.equal(f.tabs.length, 0);
});

test("missing remote tools or auth stop before destination launch without exposing credentials", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	f.auth = false;
	await assert.rejects(f.receive(bundle), (error) => /authentication unavailable/.test(error.message) && !error.message.includes("secret"));
	await assert.rejects(receive(bundle, { root: f.destRoot, exec: async () => { throw new Error("ENOENT"); } }), /ENOENT/);
	assert.equal(f.tabs.length, 0);
});

test("lost launch acknowledgement reconciles the stable tab without duplicate launch", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	f.loseLaunch = true;
	await assert.rejects(f.receive(bundle), /lost launch/);
	const receipt = await f.receive(bundle);
	assert.equal(receipt.status, "launched");
	assert.equal(receipt.tabId, 1);
	assert.equal(f.tabs.length, 1);
	assert.equal(f.calls.filter((call) => call.args.includes("new-tab")).length, 1);
});

test("a failed container creation after publication retries preparation without duplicate launch", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	let failContainer = true;
	const exec = (command, args) => {
		if (args.includes("--create-background") && failContainer) throw new Error("container unavailable");
		return f.exec(command, args);
	};
	await assert.rejects(receive(bundle, { root: f.destRoot, exec }), /container unavailable/);
	const record = await json(join(f.destRoot, "incoming", `${bundle.id}.json`));
	assert.equal(record.status, "prepared");
	const pristine = await readFile(record.sessionFile, "utf8");
	await writeFile(record.sessionFile, pristine + lines([entry("independent", validateSnapshot(pristine).entries.at(-1).id, { role: "user", content: "unsafe" })]));
	await assert.rejects(receive(bundle, { root: f.destRoot, exec }), /advanced session/);
	await writeFile(record.sessionFile, pristine);
	failContainer = false;
	assert.equal((await receive(bundle, { root: f.destRoot, exec })).status, "launched");
	assert.equal(f.tabs.length, 1);
});

test("uncertain launch without a tab stays blocked rather than issuing another request", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	f.failLaunch = true;
	await assert.rejects(f.receive(bundle), /could not send/);
	await assert.rejects(f.receive(bundle), /uncertain/);
	assert.equal(f.calls.filter((call) => call.args.includes("new-tab")).length, 1);
});

test("lost SSH response retries the same transfer safely; payload never enters SSH command text", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	let attempt = 0;
	const ssh = async (command, args, options) => {
		assert.equal(command, "ssh");
		assert.equal(args.at(-2), f.target.host);
		assert.ok(!args.at(-1).includes(f.target.worktree));
		assert.ok(!args.at(-1).includes(f.branch));
		const receipt = await f.receive(JSON.parse(options.input));
		if (++attempt === 1) throw new Error("lost SSH response");
		return JSON.stringify(receipt);
	};
	await assert.rejects(send(bundle, extensionDir, ssh), /lost SSH/);
	assert.equal((await send(bundle, extensionDir, ssh)).status, "launched");
	assert.equal(f.tabs.length, 1);
});

test("reverse handoff fast-forwards original worktree and preserves conversation; independently advanced session is refused", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	const receipt = await f.receive(bundle);
	const { header, entries } = validateSnapshot(await readFile(receipt.sessionFile, "utf8"));
	entries.push(entry("back-user", entries.at(-1).id, { role: "user", content: "Bring this back" }));
	entries.push(entry("back-assistant", "back-user", { role: "assistant", content: [{ type: "text", text: "Returning" }], stopReason: "stop" }));
	await writeFile(receipt.sessionFile, lines([header, ...entries]));
	await f.git(f.target.worktree, "config", "user.email", "fixture@example.invalid");
	await f.git(f.target.worktree, "config", "user.name", "Fixture");
	await writeFile(join(f.target.worktree, "file"), "remote work");
	await f.git(f.target.worktree, "commit", "-am", "remote work");
	const ctx = { ...f.ctx, cwd: f.target.worktree, sessionManager: { ...manager(header, entries), getSessionFile: () => receipt.sessionFile } };
	const target = { ...f.target, host: "laptop", repo: f.source, worktree: f.source };
	const back = await freeze(ctx, target, extensionDir, f.destRoot);
	const originalText = await readFile(bundle.source.file, "utf8");
	const advanced = entry("independent", "r", { role: "user", content: "independent local work" });
	await writeFile(bundle.source.file, originalText + lines([advanced]));
	await assert.rejects(receive(back, { root: f.sourceRoot, exec: f.exec }), /advanced independently/);
	await writeFile(bundle.source.file, originalText);
	const returned = await receive(back, { root: f.sourceRoot, exec: f.exec });
	assert.equal(await readFile(join(f.source, "file"), "utf8"), "remote work");
	assert.ok(validateSnapshot(await readFile(returned.sessionFile, "utf8")).branch.some((item) => item.id === "back-assistant"));
	assert.equal(f.tabs.length, 2);
	assert.deepEqual(await receive(back, { root: f.sourceRoot, exec: f.exec }), returned);
});

test("pull return uses only a frozen export and refuses stale or advanced source snapshots", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	assert.deepEqual(await exportFrozen(bundle.id, f.sourceRoot), bundle);
	const ssh = async (command, args) => {
		assert.equal(command, "ssh");
		assert.ok(args.at(-1).includes(`m.exportFrozen("${bundle.id}")`));
		return JSON.stringify(await exportFrozen(bundle.id, f.sourceRoot));
	};
	const receipt = await pull(f.target, bundle.id, extensionDir, { exec: ssh, root: f.destRoot, destinationExec: f.exec });
	assert.equal(receipt.status, "launched");
	assert.equal(f.tabs.length, 1);
	const original = await readFile(bundle.source.file, "utf8");
	await writeFile(bundle.source.file, original + lines([entry("independent", "r", { role: "user", content: "unsafe" })]));
	await assert.rejects(exportFrozen(bundle.id, f.sourceRoot), /advanced independently/);
	await assert.rejects(send(bundle, extensionDir, ssh), /advanced independently/);
	await writeFile(sourcePath(f.sourceRoot, bundle.sessionId), JSON.stringify({ status: "received" }));
	await assert.rejects(exportFrozen(bundle.id, f.sourceRoot), /not the current frozen/);
});

test("destination worktree must belong to the configured repository, even with matching relative .git paths", async (t) => {
	const f = await fixture(t), bundle = await f.freeze();
	await run("git", ["clone", f.origin, f.target.repo]);
	await run("git", ["clone", f.origin, f.target.worktree]);
	await f.git(f.target.worktree, "checkout", f.branch);
	await assert.rejects(f.receive(bundle), /another repository/);
	assert.equal(f.tabs.length, 0);
});

test("simultaneous source requests freeze only one transfer", async (t) => {
	const f = await fixture(t);
	const results = await Promise.allSettled([f.freeze(), f.freeze()]);
	assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
	assert.equal(results.filter((item) => item.status === "rejected").length, 1);
});

test("target configuration rejects relative paths and SSH option injection", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "pi-handoff-config-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	await writeFile(join(dir, "handoff.json"), JSON.stringify({ targets: { homelab: { host: "-ProxyCommand=bad", repo: "/repo", worktree: "/work" } } }));
	await assert.rejects(loadTarget(undefined, dir), /SSH/);
	await writeFile(join(dir, "handoff.json"), JSON.stringify({ targets: { homelab: { host: "someone@homelab", repo: "~/repo", worktree: "/work" } } }));
	await assert.rejects(loadTarget(undefined, dir), /absolute/);
});

test("extension queues tool handoff until settled and guards a frozen source", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "pi-handoff-extension-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const saved = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = dir;
	t.after(() => { if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = saved; });
	await writeFile(join(dir, "handoff.json"), JSON.stringify({ targets: { homelab: { host: "homelab", repo: "/repo", worktree: "/work" } } }));
	const tools = new Map(), events = new Map(), commands = new Map();
	extension({ registerTool: (tool) => tools.set(tool.name, tool), registerCommand: (name, command) => commands.set(name, command), on: (name, handler) => events.set(name, handler) });
	let aborted = false;
	const ctx = { hasUI: false, sessionManager: { getSessionId: () => "s" }, abort: () => { aborted = true; } };
	const result = await tools.get("session_handoff").execute("tool-call", {}, undefined, undefined, ctx);
	assert.equal(result.terminate, true);
	assert.equal((await events.get("input")({}, ctx)).action, "handled");
	assert.equal((await events.get("tool_call")({}, ctx)).block, true);
	assert.equal((await events.get("user_bash")({}, ctx)).result.exitCode, 1);
	await assert.rejects(events.get("before_agent_start")({}, ctx), /frozen/);
	assert.equal(aborted, true);
	// A session replacement drops the queued request without transporting it.
	ctx.sessionManager.getSessionId = () => "different";
	await events.get("agent_settled")({}, ctx);
	assert.equal(await events.get("input")({}, ctx), undefined);
	assert.ok(commands.has("handoff"));
});
