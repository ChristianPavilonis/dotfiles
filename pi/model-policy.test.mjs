import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`.pi/agent/${path}`, import.meta.url), "utf8");
const settings = JSON.parse(read("settings.json"));
const primary = "openai-codex/gpt-6.1-sol";
const lightweight = "openai-codex/gpt-6-luna";

test("new sessions and unpinned subagents default to GPT-6.1 Sol", () => {
  assert.equal(`${settings.defaultProvider}/${settings.defaultModel}`, primary);
  assert.equal(settings.subagents.defaultModel, primary);
});

test("only the scout role uses the lightweight model", () => {
  assert.equal(settings.subagents.agentOverrides.scout.model, lightweight);
  for (const [name, override] of Object.entries(settings.subagents.agentOverrides)) {
    if (name !== "scout" && !override.disabled) {
      assert.equal(override.model ?? settings.subagents.defaultModel, primary, name);
    }
  }
});

test("custom agent profiles inherit the configured subagent default", () => {
  for (const name of readdirSync(new URL(".pi/agent/agents/", import.meta.url))) {
    if (!name.endsWith(".md")) continue;
    const frontmatter = read(`agents/${name}`).split("---")[1];
    assert.doesNotMatch(frontmatter, /^model:/m, name);
  }
});

test("session naming uses GPT-6 Luna", () => {
  assert.match(read("extensions/session-title.ts"), /const TITLE_MODEL = "gpt-6-luna";/);
});
