#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config";
import { AutomationEngine } from "./engine";
import { createLogger } from "./logger";
import { OpenCodeClient } from "./opencode-client";
import { DispatchStore } from "./store";
import type { AutomationPlugin, PluginFactory } from "./types";

interface CliOptions {
  configPath: string;
  once: boolean;
  dryRun: boolean;
  debug: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let configPath = "";
  let once = false;
  let dryRun = false;
  let debug = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--once") {
      once = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--debug") {
      debug = true;
      continue;
    }

    if (arg === "--config") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --config");
      }
      configPath = next;
      i += 1;
      continue;
    }
  }

  if (!configPath) {
    const cwdConfig = resolve(process.cwd(), "config.json");
    const repoConfig = resolve(process.cwd(), "yesmand/config.json");
    configPath = existsSync(cwdConfig) ? cwdConfig : repoConfig;
  }

  return {
    configPath: resolve(configPath),
    once,
    dryRun,
    debug,
  };
}

async function loadPlugins(
  configPath: string,
  definitions: Awaited<ReturnType<typeof loadConfig>>["plugins"],
  logger: ReturnType<typeof createLogger>
): Promise<AutomationPlugin[]> {
  const plugins: AutomationPlugin[] = [];

  for (const def of definitions) {
    if (!def.enabled) {
      logger.info("Plugin disabled, skipping", { plugin: def.id });
      continue;
    }

    const moduleUrl = pathToFileURL(def.modulePath).href;
    const loaded = (await import(moduleUrl)) as {
      createPlugin?: PluginFactory;
    };

    if (typeof loaded.createPlugin !== "function") {
      throw new Error(
        `Plugin module '${def.modulePath}' must export createPlugin(config, ctx)`
      );
    }

    const plugin = await loaded.createPlugin(def.config, { logger });
    if (!plugin.id) {
      throw new Error(`Plugin at '${def.modulePath}' returned missing id`);
    }

    logger.info("Loaded plugin", {
      plugin: plugin.id,
      modulePath: def.modulePath,
      configPath,
    });

    plugins.push(plugin);
  }

  return plugins;
}

async function run(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const logger = createLogger(opts.debug);
  const appConfig = await loadConfig(opts.configPath);
  const dryRun = opts.dryRun || appConfig.dryRun;

  logger.info("Starting yesmand", {
    configPath: opts.configPath,
    once: opts.once,
    dryRun,
  });

  if (!dryRun && !appConfig.opencode.password) {
    throw new Error(
      "OpenCode password is required for non-dry-run mode (set password or passwordEnv in config)"
    );
  }

  const plugins = await loadPlugins(opts.configPath, appConfig.plugins, logger);
  const store = new DispatchStore(appConfig.databasePath);
  const openCode = new OpenCodeClient(appConfig.opencode, logger);
  const engine = new AutomationEngine({
    plugins,
    logger,
    store,
    openCode,
    dryRun,
  });

  const intervalMs = appConfig.pollIntervalMinutes * 60 * 1000;

  if (opts.once) {
    await engine.runCycle();
    store.close();
    return;
  }

  while (true) {
    await engine.runCycle();
    await Bun.sleep(intervalMs);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[yesmand] fatal: ${message}`);
  process.exit(1);
});
