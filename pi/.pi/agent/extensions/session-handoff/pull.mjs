// Run from the receiving machine only, after stopping the frozen source Pi.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTarget, pull } from "./core.mjs";

const [target, id, ...extra] = process.argv.slice(2);
try {
	if (!target || !id || extra.length) throw new Error("Usage: node pull.mjs <source-target-name> <frozen-transfer-id>");
	const receipt = await pull(await loadTarget(target), id, dirname(fileURLToPath(import.meta.url)));
	console.log(JSON.stringify(receipt, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
