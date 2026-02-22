import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { AppConfig, PluginDefinition } from "./types";

const pluginSchema = z.object({
  id: z.string().min(1),
  module: z.string().min(1),
  enabled: z.boolean().default(true),
  config: z.unknown().optional().default({}),
});

const configSchema = z.object({
  pollIntervalMinutes: z.number().int().min(1).default(5),
  dryRun: z.boolean().default(false),
  databasePath: z.string().default("./data/yesmand.db"),
  opencode: z.object({
    url: z.string().url(),
    username: z.string().min(1).default("opencode"),
    password: z.string().optional(),
    passwordEnv: z.string().optional(),
    model: z.string().min(3),
  }),
  plugins: z.array(pluginSchema).default([]),
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

function resolvePluginDefinitions(
  rawPlugins: Array<z.infer<typeof pluginSchema>>,
  configDir: string
): PluginDefinition[] {
  return rawPlugins.map((plugin) => {
    const modulePath = isAbsolute(plugin.module)
      ? plugin.module
      : resolve(configDir, plugin.module);

    return {
      id: plugin.id,
      modulePath,
      config: plugin.config,
      enabled: plugin.enabled,
    };
  });
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

  const plugins = resolvePluginDefinitions(parsed.plugins, configDir);
  const databasePath = isAbsolute(parsed.databasePath)
    ? parsed.databasePath
    : resolve(configDir, parsed.databasePath);

  return {
    pollIntervalMinutes: parsed.pollIntervalMinutes,
    dryRun: parsed.dryRun,
    databasePath,
    opencode: {
      url: parsed.opencode.url,
      username: parsed.opencode.username,
      password: resolvePassword(parsed.opencode),
      model: parsed.opencode.model,
    },
    plugins,
  };
}
