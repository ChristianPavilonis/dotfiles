import test from "node:test";
import assert from "node:assert/strict";

import nushellExtension from "./nushell.ts";

function createTool(exec) {
	let tool;
	nushellExtension({
		registerTool(value) {
			tool = value;
		},
		exec,
	});
	return tool;
}

function execute(tool, command = "focused-check") {
	return tool.execute("test-call", { command }, undefined, undefined, { cwd: "/tmp" });
}

test("successful execution preserves output and is not a tool error", async () => {
	const tool = createTool(async () => ({ code: 0, stdout: "passed\n", stderr: "warning\n", killed: false }));
	const result = await execute(tool);

	assert.notEqual(result.isError, true);
	assert.equal(result.details.ok, true);
	assert.equal(result.details.code, 0);
	assert.equal(result.content[0].text, "passed\n\nstderr:\nwarning");
});

test("nonzero execution is a tool error and retains failure details", async () => {
	const tool = createTool(async () => ({ code: 42, stdout: "partial output\n", stderr: "verification failed\n", killed: false }));
	const result = await execute(tool);

	assert.equal(result.isError, true);
	assert.equal(result.details.ok, false);
	assert.equal(result.details.code, 42);
	assert.equal(result.details.stdout, "partial output\n");
	assert.equal(result.details.stderr, "verification failed\n");
	assert.equal(result.content[0].text, "partial output\n\nstderr:\nverification failed");
});

test("killed execution is a tool error even if the exit code is zero", async () => {
	const tool = createTool(async () => ({ code: 0, stdout: "partial output", stderr: "", killed: true }));
	const result = await execute(tool);

	assert.equal(result.isError, true);
	assert.equal(result.details.ok, false);
	assert.equal(result.details.killed, true);
	assert.equal(result.content[0].text, "partial output");
});

test("empty commands return a tool error without running Nushell", async () => {
	let calls = 0;
	const tool = createTool(async () => {
		calls += 1;
		throw new Error("Execution must not be reached");
	});
	const result = await execute(tool, " \n\t ");

	assert.equal(calls, 0);
	assert.equal(result.isError, true);
	assert.equal(result.details.ok, false);
	assert.equal(result.details.reason, "empty_command");
});

test("quiet success retains its exit message and execution defaults", async () => {
	const signal = new AbortController().signal;
	let invocation;
	const tool = createTool(async (...args) => {
		invocation = args;
		return { code: 0, stdout: "", stderr: "", killed: false };
	});
	const result = await tool.execute("test-call", { command: "  print 42  " }, signal, undefined, { cwd: "/tmp" });

	assert.notEqual(result.isError, true);
	assert.equal(result.details.ok, true);
	assert.equal(result.content[0].text, "Command exited with code 0.");
	assert.deepEqual(invocation, ["nu", ["-l", "-c", "print 42"], { cwd: "/tmp", timeout: 30_000, signal }]);
});

test("execution exceptions propagate as failures", async () => {
	const tool = createTool(async () => {
		throw new Error("Spawn failed");
	});

	await assert.rejects(execute(tool), /Spawn failed/);
});
