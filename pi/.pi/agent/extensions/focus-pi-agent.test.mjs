import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const EXT_DIR = path.dirname(new URL(import.meta.url).pathname);
const SCRIPT_PATH = path.join(EXT_DIR, "focus-pi-agent.sh");

function run(command, args, options) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, options);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.on("error", reject);
		child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
	});
}

test("focus helper ignores formatted output from exited Zellij sessions", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-focus-helper-"));
	const binDir = path.join(root, "bin");
	const homeDir = path.join(root, "home");
	const logPath = path.join(root, "commands.log");
	await mkdir(binDir, { recursive: true });

	try {
		await writeFile(path.join(binDir, "hyprctl"), "#!/usr/bin/env bash\nexit 0\n");
		await writeFile(path.join(binDir, "zellij"), `#!/usr/bin/env bash
echo "$*" >> "$TEST_LOG"
if [[ "$*" == "list-sessions --short" ]]; then
  echo exited-session
  echo current-session
elif [[ "$*" == *"--session target-session action list-clients"* ]]; then
  echo "CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND"
elif [[ "$*" == *"--session exited-session action list-clients"* ]]; then
  echo "yesman [Created 1m ago]"
  echo "trusted-server [Created 1m ago]"
elif [[ "$*" == *"--session current-session action list-clients"* ]]; then
  echo "CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND"
  echo "1 terminal_1 pi"
fi
`);
		await chmod(path.join(binDir, "hyprctl"), 0o755);
		await chmod(path.join(binDir, "zellij"), 0o755);

		const result = await run(SCRIPT_PATH, ["target-session", "terminal_7", "0xabc"], {
			env: {
				...process.env,
				HOME: homeDir,
				PATH: `${binDir}:${process.env.PATH}`,
				TEST_LOG: logPath,
			},
		});
		assert.equal(result.code, 0, result.stderr);

		const log = await readFile(logPath, "utf8");
		assert.match(log, /--session current-session pipe/);
		assert.doesNotMatch(log, /--session exited-session pipe/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
