import {
  buildPrompt,
  conversationTitle,
  dailyRequestId,
  isDue,
  nowInTimeZone,
  parseSettings,
} from "./main.ts";

const WORKSPACE_ID = "0190c7d4-5f4c-7cc6-9f35-000000000002";

Deno.test("settings are inert without an explicit enabled workspace", () => {
  const defaults = parseSettings({});
  if (defaults.enabled || defaults.workspaceId !== undefined) {
    throw new Error("default settings must not schedule repository updates");
  }

  const invalid = parseSettings({ enabled: true, workspace_id: "not-a-uuid" });
  if (invalid.enabled) {
    throw new Error("invalid workspace scope must disable the extension");
  }

  const configured = parseSettings({
    enabled: true,
    workspace_id: WORKSPACE_ID,
    projects_root: "/Users/christian/projects",
    branches: ["main", "release/1.0", "--upload-pack=bad", "main"],
    daily_hour: 6,
    daily_minute: 30,
  });
  if (
    !configured.enabled || configured.workspaceId !== WORKSPACE_ID ||
    configured.branches.join(",") !== "main,release/1.0"
  ) {
    throw new Error("valid explicit configuration was not retained safely");
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

Deno.test("schedule is evaluated in its configured time zone through its minute", () => {
  const before = nowInTimeZone(
    new Date("2026-08-08T11:29:00Z"),
    "America/Chicago",
  );
  const at = nowInTimeZone(
    new Date("2026-08-08T11:30:00Z"),
    "America/Chicago",
  );
  const schedule = { dailyHour: 6, dailyMinute: 30 };
  if (
    before.hour !== 6 || before.minute !== 29 || isDue(before, schedule) ||
    at.hour !== 6 || at.minute !== 30 || !isDue(at, schedule)
  ) {
    throw new Error("daily schedule did not honor America/Chicago and 06:30");
  }
});

Deno.test("generated prompt preserves the fast-forward-only safety boundary", () => {
  const settings = parseSettings({
    enabled: true,
    workspace_id: WORKSPACE_ID,
    projects_root: "/Users/christian/projects",
    branches: ["main", "master"],
  });
  const prompt = buildPrompt(settings, "2026-08-08");
  if (
    !prompt.includes("non-hidden direct child directories") ||
    !prompt.includes("git pull --ff-only") ||
    !prompt.includes("Do not force the refspec") ||
    !prompt.includes("Do not recurse") ||
    prompt.includes("git reset --hard")
  ) {
    throw new Error(
      "prompt does not retain the legacy updater safety boundary",
    );
  }
  if (conversationTitle("2026-08-08").length > 128) {
    throw new Error("title exceeds schema bound");
  }
});
