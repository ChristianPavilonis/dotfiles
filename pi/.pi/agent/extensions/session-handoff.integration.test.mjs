import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run, json, sourcePath, validateSnapshot } from "./session-handoff/core.mjs";

const extensionDir = join(dirname(fileURLToPath(import.meta.url)), "session-handoff");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("real Pi settled tool export crosses mocked SSH and launches exactly one isolated Zellij tab", {
	skip: process.env.PI_HANDOFF_INTEGRATION_TEST !== "1", timeout: 45000,
}, async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "pi-handoff-integration-"));
	const session = `pi-handoff-test-${process.pid}`;
	const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", TERM: "xterm-256color" };
	for (const key of Object.keys(env)) if (key.startsWith("ZELLIJ")) delete env[key];
	const realPi = await run("sh", ["-c", "command -v pi"]), realZellij = await run("sh", ["-c", "command -v zellij"]);
	const source = join(dir, "source ' $ ;"), origin = join(dir, "origin.git");
	const sourceAgent = join(dir, "source-agent"), destAgent = join(dir, "dest-agent"), bin = join(dir, "bin");
	const launchLog = join(dir, "launch.json");
	await Promise.all([sourceAgent, destAgent, bin].map((path) => mkdir(path, { recursive: true })));
	const git = (cwd, ...args) => run("git", ["-C", cwd, ...args], { env });
	await run("git", ["init", "--bare", "--initial-branch=main", origin], { env });
	await run("git", ["init", "--initial-branch=main", source], { env });
	await git(source, "config", "user.email", "fixture@example.invalid");
	await git(source, "config", "user.name", "Fixture");
	await writeFile(join(source, "file"), "fixture");
	await git(source, "add", "file");
	await git(source, "commit", "-m", "fixture");
	await git(source, "remote", "add", "origin", origin);
	await writeFile(join(dir, "config.kdl"), 'show_startup_tips false\nshow_release_notes false\nsession_serialization false\ndefault_shell "/bin/sh"\n');
	// Executable adapters contain only fixture-owned paths. The target Pi process
	// records argv and stays alive; it cannot call a paid provider.
	const destPi = join(bin, "destination-pi.mjs"), zj = join(bin, "zellij.mjs");
	await writeFile(destPi, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';
if (process.argv.includes('--version') || process.argv[2] === 'auth') process.exit(0);
writeFileSync(${JSON.stringify(launchLog)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));
setInterval(() => {}, 1000);\n`, { mode: 0o700 });
	await writeFile(zj, `#!/usr/bin/env node\nimport { spawn } from 'node:child_process';
const child = spawn(${JSON.stringify(realZellij)}, ['--config', ${JSON.stringify(join(dir, "config.kdl"))}, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('error', () => process.exit(1)); child.on('exit', c => process.exit(c ?? 1));\n`, { mode: 0o700 });
	await writeFile(join(bin, "ssh"), `#!/usr/bin/env node\nimport { spawn } from 'node:child_process';
const child = spawn('/bin/sh', ['-c', process.argv.at(-1)], { stdio: 'inherit', env: { ...process.env, PI_CODING_AGENT_DIR: process.env.HANDOFF_PULL_SOURCE ? ${JSON.stringify(sourceAgent)} : ${JSON.stringify(destAgent)} } });
child.on('error', () => process.exit(1)); child.on('exit', c => process.exit(c ?? 1));\n`, { mode: 0o700 });
	await writeFile(join(sourceAgent, "handoff.json"), JSON.stringify({ targets: { homelab: { host: "fixture@homelab", repo: join(dir, "remote.git"), worktree: join(dir, "remote ' ; $"), zellijSession: session, pi: destPi, zellij: zj, extension: extensionDir } } }));
	const provider = join(dir, "offline-provider.ts");
	await writeFile(provider, `import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
export default function(pi) {
 pi.registerProvider('handoff-fixture', {
  api: 'anthropic-messages', apiKey: 'offline-fixture', baseUrl: 'http://invalid.invalid',
  models: [{ id: 'offline', name: 'offline', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 1024 }],
  streamSimple(model, context) {
   const stream = createAssistantMessageEventStream();
   const verifying = process.env.HANDOFF_VERIFY === '1';
   if (verifying && !context.messages.some(m => m.role === 'toolResult' && m.toolCallId === 'actual-handoff-call')) throw new Error('Resumed model context lost finalized handoff result');
   if (verifying && JSON.stringify(context.messages).includes('UNSELECTED_BRANCH')) throw new Error('Resumed the wrong conversation branch');
   const reason = verifying ? 'stop' : 'toolUse';
   const content = verifying ? [{ type: 'text', text: 'snapshot resumed successfully' }] : [{ type: 'toolCall', id: 'actual-handoff-call', name: 'session_handoff', arguments: {} }];
   const message = { role: 'assistant', content, api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: reason, timestamp: Date.now() };
   stream.push({ type: 'done', reason, message }); stream.end(); return stream;
  }
 });
}`);
	const sourceSession = join(dir, "actual-source.jsonl");
	const callerEnv = { ...env, PATH: `${bin}:${env.PATH}`, PI_CODING_AGENT_DIR: sourceAgent };
	t.after(async () => {
		await run(zj, ["kill-session", session], { env }).catch(() => {});
		await rm(dir, { recursive: true, force: true });
	});
	const output = await run(realPi, ["--offline", "--no-extensions", "-e", join(extensionDir, "index.ts"), "-e", provider,
		"--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-tools", "--tools", "session_handoff",
		"--model", "handoff-fixture/offline", "--mode", "json", "--print", "--session", sourceSession, "--", "Move this fixture to homelab"], { cwd: source, env: callerEnv });
	assert.ok(output.includes("actual-handoff-call"));
	const sourceEntries = (await readFile(sourceSession, "utf8")).trim().split("\n").map(JSON.parse);
	const guard = await json(sourcePath(join(sourceAgent, "handoffs"), sourceEntries[0].id));
	assert.equal(guard.status, "frozen");
	const { bundle } = guard;
	const record = await json(join(destAgent, "handoffs/incoming", `${bundle.id}.json`));
	assert.equal(record.status, "launched");
	const snapshot = validateSnapshot(await readFile(record.sessionFile, "utf8"));
	assert.ok(snapshot.branch.some((entry) => entry.message?.role === "toolResult" && entry.message.toolCallId === "actual-handoff-call"), "settled export must include the final handoff tool result");
	assert.equal((await stat(record.sessionFile)).mode & 0o777, 0o600);
	let launched;
	for (let attempt = 0; attempt < 100; attempt++) {
		try { launched = await json(launchLog); break; } catch (error) { if (error.code !== "ENOENT") throw error; }
		await delay(50);
	}
	assert.ok(launched, "destination executable started");
	assert.equal(launched.cwd, bundle.target.worktree);
	assert.equal(launched.args[launched.args.indexOf("--session") + 1], record.sessionFile);
	assert.ok(launched.args.at(-1).includes(bundle.code.commit));
	// Open the shipped snapshot through real Pi too. This uses an offline model,
	// not the destination placeholder, and checks actual reconstructed context.
	const resumed = join(dir, "resumed-copy.jsonl");
	const resumeEntries = (await readFile(record.sessionFile, "utf8")).trim().split("\n").map(JSON.parse);
	const pin = resumeEntries.pop();
	resumeEntries.push({ type: "message", id: "unselected-branch", parentId: pin.parentId, timestamp: new Date().toISOString(), message: { role: "user", content: "UNSELECTED_BRANCH", timestamp: Date.now() } }, pin);
	await writeFile(resumed, resumeEntries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
	await mkdir(join(destAgent, "extensions"));
	await symlink(extensionDir, join(destAgent, "extensions/session-handoff"));
	const resumedOutput = await run(realPi, ["--offline", "-e", join(destAgent, "extensions/session-handoff/index.ts"), "-e", provider,
		"--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-tools",
		"--model", "handoff-fixture/offline", "--print", "--session", resumed, "--", launched.args.at(-1)],
		{ cwd: bundle.target.worktree, env: { ...env, PI_CODING_AGENT_DIR: destAgent, HANDOFF_VERIFY: "1" } });
	assert.ok(resumedOutput.includes("snapshot resumed successfully"), resumedOutput);
	// Replay through the exact shipping SSH encoder and remote receiver.
	const { send } = await import("./session-handoff/core.mjs");
	const receipt = await send(bundle, extensionDir, (command, args, options) => run(command, args, { ...options, env: callerEnv }));
	assert.equal(receipt.tabId, record.tabId);
	const tabs = JSON.parse(await run(zj, ["--session", session, "action", "list-tabs", "--json"], { env }));
	assert.equal(tabs.filter((tab) => tab.name === record.tab).length, 1);
	// A new Pi process with the frozen source cannot continue that transcript.
	const sourceBefore = await readFile(sourceSession, "utf8");
	await run(realPi, ["--offline", "--no-extensions", "-e", join(extensionDir, "index.ts"), "-e", provider,
		"--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-tools",
		"--model", "handoff-fixture/offline", "--print", "--session", sourceSession, "--", "This must be blocked"], { cwd: source, env: callerEnv });
	assert.equal(await readFile(sourceSession, "utf8"), sourceBefore);
	// Exercise the pull CLI through the real SSH encoder, exporting the frozen
	// original source and replaying the same receipt on the receiving machine.
	await writeFile(join(destAgent, "handoff.json"), JSON.stringify({ targets: { homelab: { host: "fixture@homelab", repo: source, worktree: source } } }));
	const pulled = JSON.parse(await run(process.execPath, [join(extensionDir, "pull.mjs"), "homelab", bundle.id],
		{ env: { ...callerEnv, PI_CODING_AGENT_DIR: destAgent, HANDOFF_PULL_SOURCE: "1" } }));
	assert.equal(pulled.tabId, record.tabId);
	assert.equal(JSON.parse(await run(zj, ["--session", session, "action", "list-tabs", "--json"], { env })).filter((tab) => tab.name === record.tab).length, 1);
});
