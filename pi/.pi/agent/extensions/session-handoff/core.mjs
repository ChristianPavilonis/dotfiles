import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename, rm, access } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join, isAbsolute, dirname } from "node:path";

export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const stateRoot = () => join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi/agent"), "handoffs");
export const sourcePath = (root, id) => join(root, "sources", `${digest(id)}.json`);
const encode = (entries) => entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
const check = (condition, message) => { if (!condition) throw new Error(message); };
export async function exists(path) {
	try { await access(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
export async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
export async function atomic(path, value) {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${process.pid}.tmp`;
	try {
		await writeFile(temp, value, { mode: 0o600, flag: "wx" });
		await rename(temp, path);
	} finally { await rm(temp, { force: true }); }
}
export function run(command, args, { cwd, input, env = process.env } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "", stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.on("error", reject);
		child.stdin.on("error", () => {});
		child.stdin.end(input);
		child.on("close", (code) => {
			if (code === 0) resolve(stdout.trim());
			else reject(new Error(`${command} failed (${code}): ${stderr.trim() || stdout.trim()}`));
		});
	});
}
const git = (cwd, ...args) => run("git", ["-C", cwd, ...args], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });

// Keep the entire tree, then pin the selected leaf with an explicit JSONL entry.
// getEntries/getLeafId read finalized state, not a potentially unflushed file.
export function snapshot(manager, cwd) {
	const header = manager.getHeader();
	check(header?.version === 3, "Handoff requires a version 3 persistent session");
	const entries = manager.getEntries();
	const leaf = manager.getLeafId();
	const pin = { type: "custom", id: `handoff-${digest(JSON.stringify([header.id, leaf, cwd])).slice(0, 24)}`, parentId: leaf,
		timestamp: new Date().toISOString(), customType: "session-handoff-snapshot", data: { sourceCwd: header.cwd } };
	const text = encode([{ ...header, cwd }, ...entries, pin]);
	validateSnapshot(text);
	return text;
}
export function validateSnapshot(text) {
	check(typeof text === "string" && text.endsWith("\n"), "Truncated session");
	const [header, ...entries] = text.trimEnd().split("\n").map((line) => JSON.parse(line));
	check(header?.type === "session" && header.version === 3 && typeof header.id === "string", "Invalid session header");
	const byId = new Map();
	for (const entry of entries) {
		check(typeof entry.id === "string" && !byId.has(entry.id), "Duplicate or missing entry ID");
		check(entry.parentId === null || byId.has(entry.parentId), "Missing session parent");
		byId.set(entry.id, entry);
	}
	const branch = [];
	for (let entry = entries.at(-1); entry; entry = byId.get(entry.parentId)) branch.unshift(entry);
	const pending = new Set();
	for (const entry of branch) {
		const message = entry.message;
		if (message?.role === "assistant") {
			check(!pending.size, "Unfinished tool calls before assistant continuation");
			for (const block of message.content) if (block.type === "toolCall") pending.add(block.id);
		}
		if (message?.role === "toolResult") {
			check(pending.delete(message.toolCallId), "Orphan tool result");
		}
	}
	check(!pending.size, "Snapshot contains unfinished tool calls");
	return { header, entries, branch };
}
function containsHistory(incoming, previous, requireSelectedLeaf = true) {
	const next = validateSnapshot(incoming), old = validateSnapshot(previous);
	check(next.header.id === old.header.id, "Different session identity");
	const byId = new Map(next.entries.map((entry) => [entry.id, JSON.stringify(entry)]));
	for (const entry of old.entries) check(byId.get(entry.id) === JSON.stringify(entry), "Destination session advanced independently");
	const selected = new Set(next.branch.map((entry) => entry.id));
	check(!requireSelectedLeaf || !old.entries.length || selected.has(old.entries.at(-1).id), "Incoming session does not continue the destination branch");
}
export async function loadTarget(name = "homelab", agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi/agent")) {
	const config = await json(join(agentDir, "handoff.json"));
	const target = config.targets?.[name];
	check(target, `No handoff target ${name} in ${agentDir}/handoff.json`);
	check(typeof target.host === "string" && /^[a-zA-Z0-9_@.:-]+$/.test(target.host) && !target.host.startsWith("-"), "Invalid SSH destination");
	for (const key of ["repo", "worktree"]) check(typeof target[key] === "string" && isAbsolute(target[key]), `${key} must be an absolute destination path`);
	return { name, ...target };
}
export async function codeIdentity(cwd) {
	const root = await git(cwd, "rev-parse", "--show-toplevel");
	check(root === cwd, "Start Pi at the worktree root before handoff");
	check(!(await git(cwd, "status", "--porcelain", "--untracked-files=all")), "Commit intended changes first; source worktree is dirty");
	const branch = await git(cwd, "symbolic-ref", "--short", "HEAD");
	const commit = await git(cwd, "rev-parse", "HEAD");
	const origin = await git(cwd, "remote", "get-url", "origin");
	check(!origin.startsWith("-") && !origin.includes("\n"), "Invalid origin URL");
	// Push explicitly. Never stage, commit, force, or create temporary refs.
	await git(cwd, "push", "origin", `refs/heads/${branch}:refs/heads/${branch}`);
	const pushed = await git(cwd, "ls-remote", "--exit-code", "origin", `refs/heads/${branch}`);
	check(pushed.split(/\s/)[0] === commit, "Pushed branch no longer matches source HEAD");
	check(await git(cwd, "rev-parse", "HEAD") === commit && !(await git(cwd, "status", "--porcelain", "--untracked-files=all")), "Source changed during push");
	return { root, branch, commit, origin };
}
export async function freeze(ctx, target, extensionDir, root = stateRoot()) {
	return locked(join(root, "locks", digest(ctx.sessionManager.getSessionId())), () => freezeLocked(ctx, target, extensionDir, root));
}
async function freezeLocked(ctx, target, extensionDir, root) {
	check(!ctx.hasPendingMessages(), "Drain queued messages before handoff");
	const id = ctx.sessionManager.getSessionId();
	const path = sourcePath(root, id);
	check(!(await exists(path)) || (await json(path)).status !== "frozen", "Source already frozen. Use /handoff retry");
	const code = await codeIdentity(ctx.cwd);
	const session = snapshot(ctx.sessionManager, target.worktree);
	const core = await readFile(join(extensionDir, "core.mjs"), "utf8");
	const index = await readFile(join(extensionDir, "index.ts"), "utf8");
	const bundle = { version: 1, target, code, source: { host: hostname(), cwd: ctx.cwd, file: ctx.sessionManager.getSessionFile() },
		sessionId: id, session, checksum: digest(session), extensionHash: digest(core + index),
		model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined };
	check(bundle.source.file && bundle.model, "A persistent session and selected model are required");
	bundle.id = digest(JSON.stringify(bundle));
	await atomic(join(root, "outgoing", `${bundle.id}.json`), JSON.stringify(bundle));
	await atomic(path, JSON.stringify({ status: "frozen", bundle, record: join(root, "outgoing", `${bundle.id}.json`) }));
	return bundle;
}
export async function send(bundle, extensionDir, exec = run) {
	containsHistory(bundle.session, await readFile(bundle.source.file, "utf8"), false);
	const receipt = JSON.parse(await remote(bundle.target, extensionDir, "m.remoteMain()", JSON.stringify(bundle), exec));
	check(receipt.id === bundle.id && receipt.status === "launched", "Remote did not confirm launch; source remains frozen");
	return receipt;
}
async function remote(target, extensionDir, expression, input, exec) {
	const code = await readFile(join(extensionDir, "core.mjs"), "utf8");
	// SSH joins command arguments for the login shell. Only base64 and a fixed
	// expression cross that boundary. User data travels over stdin, never shell text.
	const program = `import("data:text/javascript;base64,${Buffer.from(code).toString("base64")}").then(m=>${expression})`;
	const node = target.node || "node";
	check(/^[a-zA-Z0-9_/.+-]+$/.test(node) && !node.startsWith("-"), "Invalid remote node executable");
	return exec("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", "--", target.host,
		`${node} --input-type=module -e '${program}'`], { input });
}
// Pull is for a source that cannot SSH back. It exports only the still-frozen
// transfer, never a live session file. The user must stop the source Pi first.
export async function exportFrozen(id, root = stateRoot()) {
	check(/^[a-f0-9]{64}$/.test(id), "Invalid transfer ID");
	const bundle = await json(join(root, "outgoing", `${id}.json`));
	const guard = await json(sourcePath(root, bundle.sessionId));
	check(guard.status === "frozen" && guard.bundle.id === id, "Transfer is not the current frozen source");
	containsHistory(bundle.session, await readFile(bundle.source.file, "utf8"), false);
	return bundle;
}
export async function pull(target, id, extensionDir, { exec = run, root = stateRoot(), destinationExec = run } = {}) {
	check(/^[a-f0-9]{64}$/.test(id), "Invalid transfer ID");
	const expression = `m.exportFrozen("${id}").then(b=>console.log(JSON.stringify(b))).catch(e=>{console.error(e.message);process.exitCode=1})`;
	const bundle = JSON.parse(await remote(target, extensionDir, expression, undefined, exec));
	check(bundle.id === id, "Pulled a different transfer");
	return receive(bundle, { root, exec: destinationExec });
}
async function locked(path, fn) {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	try { await mkdir(path, { mode: 0o700 }); } catch (error) {
		if (error.code === "EEXIST") throw new Error(`Handoff locked: ${path}. Inspect before removing a stale lock.`);
		throw error;
	}
	try { await writeFile(join(path, "owner.json"), JSON.stringify({ pid: process.pid, host: hostname() }), { mode: 0o600 }); return await fn(); }
	finally { await rm(path, { recursive: true, force: true }); }
}
async function prepareWorktree(bundle) {
	const { target: t, code: c } = bundle;
	if (!(await exists(t.repo))) {
		await mkdir(dirname(t.repo), { recursive: true });
		await run("git", ["clone", "--bare", "--", c.origin, t.repo], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
	}
	check(await git(t.repo, "remote", "get-url", "origin") === c.origin, "Incompatible destination repository origin");
	await git(t.repo, "fetch", "origin", `refs/heads/${c.branch}:refs/remotes/origin/${c.branch}`);
	check(await git(t.repo, "rev-parse", `refs/remotes/origin/${c.branch}`) === c.commit, "Destination fetched a different commit");
	if (!(await exists(t.worktree))) {
		await mkdir(dirname(t.worktree), { recursive: true });
		const branchExists = await git(t.repo, "show-ref", "--verify", `refs/heads/${c.branch}`).then(() => true, () => false);
		if (branchExists) {
			const head = await git(t.repo, "rev-parse", `refs/heads/${c.branch}`);
			check(head === c.commit, "Existing destination branch differs; reconcile it explicitly before adding a worktree");
			await git(t.repo, "worktree", "add", "--", t.worktree, c.branch);
		} else await git(t.repo, "worktree", "add", "-b", c.branch, "--", t.worktree, c.commit);
	} else {
		check(await git(t.worktree, "rev-parse", "--show-toplevel") === t.worktree, "Destination path is not a worktree root");
		check(await git(t.worktree, "rev-parse", "--path-format=absolute", "--git-common-dir") === await git(t.repo, "rev-parse", "--path-format=absolute", "--git-common-dir"), "Destination worktree belongs to another repository");
		check(!(await git(t.worktree, "status", "--porcelain", "--untracked-files=all")), "Destination worktree is dirty");
		check(await git(t.worktree, "symbolic-ref", "--short", "HEAD") === c.branch, "Destination has a different branch");
		await git(t.worktree, "merge-base", "--is-ancestor", "HEAD", c.commit);
		await git(t.worktree, "merge", "--ff-only", c.commit);
	}
	check(await git(t.worktree, "rev-parse", "HEAD") === c.commit, "Destination HEAD does not match pushed commit");
}
export async function receive(bundle, { root = stateRoot(), exec = run } = {}) {
	check(bundle.version === 1 && /^[a-f0-9]{64}$/.test(bundle.id), "Invalid transfer identity");
	const { id, ...identity } = bundle;
	check(digest(JSON.stringify(identity)) === id, "Transfer manifest integrity failed");
	check(digest(bundle.session) === bundle.checksum, "Session checksum failed");
	const session = validateSnapshot(bundle.session);
	for (const key of ["repo", "worktree"]) check(typeof bundle.target[key] === "string" && isAbsolute(bundle.target[key]), `Invalid destination ${key}`);
	check(/^[a-f0-9]{40,64}$/.test(bundle.code.commit), "Invalid commit ID");
	check(typeof bundle.model === "string" && bundle.model.includes("/"), "Invalid model identity");
	check(session.header.id === bundle.sessionId && session.header.cwd === bundle.target.worktree, "Session metadata mismatch");
	const recordPath = join(root, "incoming", `${id}.json`);
	return locked(join(root, "locks", digest(bundle.sessionId)), async () => {
		const t = bundle.target, c = bundle.code;
		const container = t.zellijSession || "pi-work";
		const tab = `handoff-${id.slice(0, 20)}`;
		const zj = (...args) => exec(t.zellij || "zellij", ["--session", container, ...args]);
		let prepared = false;
		if (await exists(recordPath)) {
			const prior = await json(recordPath);
			check(["prepared", "launching", "launched"].includes(prior.status), "Unknown incoming transfer state");
			prepared = prior.status === "prepared";
			if (prior.status === "launched") return prior;
			if (prior.status === "launching") {
				const tabs = JSON.parse(await zj("action", "list-tabs", "--json"));
				const found = tabs.filter((item) => item.name === tab);
				check(found.length === 1, `Launch outcome uncertain for ${id}. Inspect Zellij; do not retry with a new ID.`);
				const receipt = { ...prior, status: "launched", tabId: found[0].tab_id };
				await atomic(recordPath, JSON.stringify(receipt));
				return receipt;
			}
		}
		const guardPath = sourcePath(root, bundle.sessionId);
		const active = join(root, "sessions", digest(bundle.sessionId), "active.jsonl");
		if (await exists(guardPath)) {
			const prior = await json(guardPath);
			check(prior.status === "frozen", "Destination session is active, not handed off");
			containsHistory(bundle.session, prior.bundle.session);
			if (await exists(prior.bundle.source.file)) containsHistory(bundle.session, await readFile(prior.bundle.source.file, "utf8"), false);
		}
		if (await exists(active)) {
			const current = await readFile(active, "utf8");
			if (!(prepared && digest(current) === bundle.checksum)) {
				check(await exists(guardPath), "Destination has an existing or advanced session without an outgoing record");
				containsHistory(bundle.session, current);
			}
		}
		const extension = t.extension || join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi/agent"), "extensions/session-handoff");
		check(digest(await readFile(join(extension, "core.mjs"), "utf8") + await readFile(join(extension, "index.ts"), "utf8")) === bundle.extensionHash,
			"Install the same session-handoff extension on the destination first");
		// Auth check never uses --credentials and does not print captured output.
		await exec(t.pi || "pi", ["--version"]);
		await exec(t.zellij || "zellij", ["--version"]);
		try { await exec(t.pi || "pi", ["auth", "check", "--model", bundle.model]); }
		catch { throw new Error(`Destination Pi authentication unavailable for ${bundle.model}`); }
		await locked(join(root, "locks", digest(t.repo)), () => prepareWorktree(bundle));
		const receipt = { id, status: "prepared", host: t.host, zellijSession: container, tab, sessionFile: active, cwd: t.worktree, branch: c.branch, commit: c.commit };
		await atomic(recordPath, JSON.stringify(receipt));
		await atomic(active, bundle.session);
		check(digest(await readFile(active)) === bundle.checksum, "Published session checksum failed");
		await exec(t.zellij || "zellij", ["attach", "--create-background", container]);
		receipt.status = "launching";
		await atomic(recordPath, JSON.stringify(receipt));
		// Durable intent comes first. Any failure after this point is uncertain,
		// never permission for a second new-tab call.
		await atomic(guardPath, JSON.stringify({ status: "received", transfer: id }));
		const prompt = `Resuming on ${hostname()} from ${bundle.source.host}. Working directory: ${t.worktree}. Branch: ${c.branch}. Exact commit: ${c.commit}. Source directory: ${bundle.source.cwd}. Environment differences: ${t.environment || "Credentials, installed extensions, dependencies, background processes, and files outside Git remain machine-local. Recheck them before use."} Historical paths are unchanged; use the new working directory. Only this machine should continue this session.`;
		const tabId = await zj("action", "new-tab", "--name", tab, "--cwd", t.worktree, "--", t.pi || "pi", "--extension", join(extension, "index.ts"), "--session", active, "--model", bundle.model, "--", prompt);
		check(/^\d+$/.test(tabId), "Zellij returned no tab ID. Launch outcome uncertain");
		const launched = { ...receipt, status: "launched", tabId: Number(tabId) };
		await atomic(recordPath, JSON.stringify(launched));
		return launched;
	});
}
export async function remoteMain() {
	try {
		let input = "";
		for await (const chunk of process.stdin) input += chunk;
		console.log(JSON.stringify(await receive(JSON.parse(input))));
	} catch (error) { console.error(error.message); process.exitCode = 1; }
}
