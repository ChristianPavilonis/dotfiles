const extensionDirectory = new URL(".", import.meta.url).pathname;
const encoder = new TextEncoder();

const workspaceId = "0190c7d4-5f4c-7cc6-9f35-000000000002";
const generationId = "0190c7d4-5f4c-7cc6-9f35-000000000003";

Deno.test("launcher dispatches one durable daily update per workspace/date", async () => {
  const first = await runTranscript();
  const second = await runTranscript();
  const firstCreate = first.find((frame) =>
    frame.method === "conversations.create"
  );
  const secondCreate = second.find((frame) =>
    frame.method === "conversations.create"
  );

  if (!first.some((frame) => frame.id === "host:init" && frame.result)) {
    throw new Error("extension did not complete initialization");
  }
  if (
    !first.some((frame) =>
      frame.id === "host:shutdown" &&
      objectProperty(frame, "result")?.accepted === true
    )
  ) {
    throw new Error("extension did not acknowledge shutdown");
  }
  if (!firstCreate || !secondCreate) {
    throw new Error("extension did not dispatch daily work");
  }
  if (
    firstCreate.id !== secondCreate.id ||
    objectProperty(firstCreate, "params")?.workspace_id !== workspaceId
  ) {
    throw new Error(
      "restart did not preserve the daily durable receipt identity",
    );
  }
});

async function runTranscript(): Promise<Record<string, unknown>[]> {
  const path = Deno.env.get("PATH");
  if (!path) {
    throw new Error("test runner PATH is required to exercise the launcher");
  }
  const child = new Deno.Command("./run.sh", {
    cwd: extensionDirectory,
    clearEnv: true,
    env: { PATH: path, LANG: "C" },
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  try {
    await write(writer, {
      jsonrpc: "2.0",
      id: "host:init",
      method: "yesman.initialize",
      params: {
        protocol: "yesman.extension/1",
        extension_id: "git-main-updater",
        extension_release: "0.1.0",
        enabled_workspace_ids: [workspaceId],
        config: {
          enabled: true,
          workspace_id: workspaceId,
          daily_hour: 0,
          daily_minute: 0,
        },
      },
    });
    await write(writer, {
      jsonrpc: "2.0",
      method: "yesman.initialized",
      params: {
        extension_generation_id: generationId,
        capability_hash: "0".repeat(64),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await write(writer, {
      jsonrpc: "2.0",
      id: "host:shutdown",
      method: "yesman.shutdown",
      params: { reason: "manual_restart", grace_ms: 5000 },
    });
  } finally {
    await writer.close();
  }

  const output = await child.output();
  if (!output.success) {
    throw new Error(
      `launcher failed: ${new TextDecoder().decode(output.stderr)}`,
    );
  }
  return new TextDecoder().decode(output.stdout).trim().split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function objectProperty(
  frame: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = frame[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function write(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  frame: Record<string, unknown>,
): Promise<void> {
  await writer.write(encoder.encode(`${JSON.stringify(frame)}\n`));
}
