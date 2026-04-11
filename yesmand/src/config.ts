import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { AppConfig } from "./types";

const configSchema = z.object({
  dryRun: z.boolean().default(false),
  databasePath: z.string().default("./data/yesmand.db"),
  monitor: z
    .object({
      enabled: z.boolean().default(true),
      pollSeconds: z.number().int().min(5).max(300).default(30),
      stalledAfterMinutes: z.number().int().min(1).max(720).default(10),
      timeoutAfterMinutes: z.number().int().min(1).max(1440).default(60),
    })
    .default({}),
  opencode: z.object({
    url: z.string().url(),
    username: z.string().min(1).default("opencode"),
    password: z.string().optional(),
    passwordEnv: z.string().optional(),
    model: z.string().min(3),
  }),
});

function resolvePassword(source: {
  password?: string;
  passwordEnv?: string;
}): string {
  if (source.password) return source.password;
  if (source.passwordEnv) {
    const value = process.env[source.passwordEnv];
    if (value) return value;
    return "";
  }
  return "";
}

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const file = Bun.file(configPath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Config not found at ${configPath}`);
  }

  const text = await file.text();
  const parsedJson = JSON.parse(text);
  const parsed = configSchema.parse(parsedJson);
  const configDir = dirname(configPath);

  const databasePath = isAbsolute(parsed.databasePath)
    ? parsed.databasePath
    : resolve(configDir, parsed.databasePath);

  return {
    dryRun: parsed.dryRun,
    databasePath,
    monitor: {
      enabled: parsed.monitor.enabled,
      pollSeconds: parsed.monitor.pollSeconds,
      stalledAfterMinutes: parsed.monitor.stalledAfterMinutes,
      timeoutAfterMinutes: parsed.monitor.timeoutAfterMinutes,
    },
    opencode: {
      url: parsed.opencode.url,
      username: parsed.opencode.username,
      password: resolvePassword(parsed.opencode),
      model: parsed.opencode.model,
    },
  };
}
