import {
  buildPrompt,
  conversationTitle,
  dailyRequestId,
  nowInTimeZone,
  parseSettings,
} from "./main.ts";

const WORKSPACE_ID = "0190c7d4-5f4c-7cc6-9f35-000000000002";

Deno.test("settings are inert without an explicit enabled workspace", () => {
  const defaults = parseSettings({});
  if (defaults.enabled || defaults.workspaceId !== undefined) {
    throw new Error("default settings must not schedule vault work");
  }

  const invalid = parseSettings({ enabled: true, workspace_id: "not-a-uuid" });
  if (invalid.enabled) {
    throw new Error("invalid workspace scope must disable the extension");
  }

  const configured = parseSettings({
    enabled: true,
    workspace_id: WORKSPACE_ID,
    vault_path: "/Users/christian/Documents/MyObsidianVault",
    daily_folder: "daily",
    time_zone: "America/Chicago",
    daily_hour: 7,
    max_tasks: 8,
  });
  if (
    !configured.enabled || configured.workspaceId !== WORKSPACE_ID ||
    configured.maxTasks !== 8
  ) {
    throw new Error("valid explicit configuration was not retained");
  }
});

Deno.test("daily receipt identity is stable and scoped to workspace/date", () => {
  const first = dailyRequestId(WORKSPACE_ID, "2026-08-08");
  const second = dailyRequestId(WORKSPACE_ID, "2026-08-08");
  const nextDay = dailyRequestId(WORKSPACE_ID, "2026-08-09");
  if (first !== second || first === nextDay || first.length > 128) {
    throw new Error(
      "daily request identity is not a valid durable receipt identity",
    );
  }
});

Deno.test("time-zone date and hour honor America/Chicago", () => {
  const before = nowInTimeZone(
    new Date("2026-08-08T11:59:00Z"),
    "America/Chicago",
  );
  const at = nowInTimeZone(new Date("2026-08-08T12:00:00Z"), "America/Chicago");
  if (before.date !== "2026-08-08" || before.hour !== 6 || at.hour !== 7) {
    throw new Error("daily schedule was not evaluated in configured timezone");
  }
});

Deno.test("generated prompt is bounded to the managed block and current vault conventions", () => {
  const settings = parseSettings({
    enabled: true,
    workspace_id: WORKSPACE_ID,
    max_tasks: 12,
  });
  const prompt = buildPrompt(settings, "2026-08-08");
  if (
    !prompt.includes("<!-- yesman-priorities:start -->") ||
    !prompt.includes(
      "Do not delete, rewrite, or reorganize unrelated note content.",
    ) ||
    prompt.includes("project: ideas")
  ) {
    throw new Error(
      "prompt does not preserve the intended vault safety boundary",
    );
  }
  if (conversationTitle("2026-08-08").length > 128) {
    throw new Error("title exceeds schema bound");
  }
});
