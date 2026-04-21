#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config";
import { AutomationEngine } from "./engine";
import { createLogger } from "./logger";
import { OpenCodeClient } from "./opencode-client";
import { loadPlugins } from "./plugins";
import { SessionMonitor } from "./session-monitor";
import { DispatchStore } from "./store";
import type { AutomationPlugin } from "./types";

interface CliOptions {
  configPath: string;
  once: boolean;
  dryRun: boolean;
  debug: boolean;
}

interface ScheduledPluginState {
  plugin: AutomationPlugin;
  isRunning: boolean;
  runCount: number;
  nextRunAtMs: number;
}

interface ShutdownState {
  requested: boolean;
  signal?: string;
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

function getJitterMs(plugin: AutomationPlugin): number {
  const jitterSeconds = plugin.schedule.jitterSeconds ?? 0;
  if (jitterSeconds <= 0) return 0;
  const maxJitterMs = jitterSeconds * 1000;
  return Math.floor(Math.random() * (maxJitterMs + 1));
}

function getIntervalMs(plugin: AutomationPlugin): number {
  if (Number.isFinite(plugin.schedule.everySeconds) && (plugin.schedule.everySeconds as number) >= 1) {
    return Number(plugin.schedule.everySeconds) * 1000;
  }

  if (Number.isFinite(plugin.schedule.everyMinutes) && (plugin.schedule.everyMinutes as number) >= 1) {
    return Number(plugin.schedule.everyMinutes) * 60 * 1000;
  }

  throw new Error(`Plugin '${plugin.id}' has invalid schedule; expected everySeconds or everyMinutes`);
}

function computeNextRunAtMs(plugin: AutomationPlugin, nowMs: number): number {
  const intervalMs = getIntervalMs(plugin);
  return nowMs + intervalMs + getJitterMs(plugin);
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

async function runScheduledPlugin(
  state: ScheduledPluginState,
  engine: AutomationEngine,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  state.isRunning = true;
  const startedAt = Date.now();

  logger.info("Scheduled plugin run starting", {
    plugin: state.plugin.id,
    runCount: state.runCount + 1,
  });

  try {
    await engine.runPluginCycle(state.plugin);
  } catch (error) {
    logger.error("Scheduled plugin run crashed", {
      plugin: state.plugin.id,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    state.isRunning = false;
    state.runCount += 1;
    const completedAt = Date.now();
    state.nextRunAtMs = computeNextRunAtMs(state.plugin, completedAt);

    logger.info("Scheduled plugin run finished", {
      plugin: state.plugin.id,
      runCount: state.runCount,
      durationMs: completedAt - startedAt,
      nextRunAt: toIso(state.nextRunAtMs),
    });
  }
}

async function runDaemon(
  engine: AutomationEngine,
  plugins: AutomationPlugin[],
  logger: ReturnType<typeof createLogger>,
  shutdown: ShutdownState,
  monitor?: {
    runner: SessionMonitor;
    pollMs: number;
  }
): Promise<void> {
  const nowMs = Date.now();
  const states: ScheduledPluginState[] = plugins.map((plugin) => {
    const runOnStartup = plugin.schedule.runOnStartup ?? true;
    return {
      plugin,
      isRunning: false,
      runCount: 0,
      nextRunAtMs: runOnStartup ? nowMs : computeNextRunAtMs(plugin, nowMs),
    };
  });

  logger.info("Plugin scheduler started", {
    pluginCount: states.length,
    schedules: states.map((state) => ({
      plugin: state.plugin.id,
      everyMinutes: state.plugin.schedule.everyMinutes,
      everySeconds: state.plugin.schedule.everySeconds,
      runOnStartup: state.plugin.schedule.runOnStartup ?? true,
      jitterSeconds: state.plugin.schedule.jitterSeconds ?? 0,
      firstRunAt: toIso(state.nextRunAtMs),
    })),
  });

  const inFlight = new Set<Promise<void>>();
  let nextMonitorAtMs = nowMs;
  let monitorInFlight = false;

  if (monitor) {
    logger.info("Dispatch monitor enabled", {
      pollSeconds: Math.floor(monitor.pollMs / 1000),
    });
  }

  while (!shutdown.requested) {
    const currentMs = Date.now();
    const due = states.filter((state) => !state.isRunning && state.nextRunAtMs <= currentMs);

    for (const state of due) {
      const runPromise = runScheduledPlugin(state, engine, logger);
      inFlight.add(runPromise);
      runPromise.finally(() => {
        inFlight.delete(runPromise);
      });
    }

    if (monitor && !monitorInFlight && currentMs >= nextMonitorAtMs) {
      monitorInFlight = true;
      let monitorPromise: Promise<void>;
      monitorPromise = monitor.runner
        .tick()
        .catch((error) => {
          logger.error("Dispatch monitor tick failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          monitorInFlight = false;
          inFlight.delete(monitorPromise);
        });

      inFlight.add(monitorPromise);
      nextMonitorAtMs = currentMs + monitor.pollMs;
    }

    const nextDueAt = states
      .filter((state) => !state.isRunning)
      .reduce<number>((next, state) => Math.min(next, state.nextRunAtMs), Number.POSITIVE_INFINITY);

    const nextWakeAt = monitor ? Math.min(nextDueAt, nextMonitorAtMs) : nextDueAt;

    const sleepMs = Number.isFinite(nextWakeAt)
      ? Math.max(250, Math.min(5000, nextWakeAt - Date.now()))
      : 1000;

    await Bun.sleep(sleepMs);
  }

  logger.info("Scheduler stopping", {
    signal: shutdown.signal,
    inFlightRuns: inFlight.size,
  });

  await Promise.allSettled(Array.from(inFlight));
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

  const plugins = await loadPlugins(logger);
  if (plugins.length === 0) {
    throw new Error("No enabled plugins loaded. Check plugin registry and schedules.");
  }

  const store = new DispatchStore(appConfig.databasePath);
  const openCode = new OpenCodeClient(appConfig.opencode, logger);
  const monitor =
    !dryRun && appConfig.monitor.enabled
      ? {
          runner: new SessionMonitor({
            logger,
            store,
            openCode,
            plugins,
            stalledAfterMinutes: appConfig.monitor.stalledAfterMinutes,
            timeoutAfterMinutes: appConfig.monitor.timeoutAfterMinutes,
          }),
          pollMs: appConfig.monitor.pollSeconds * 1000,
        }
      : undefined;

  const engine = new AutomationEngine({
    plugins,
    logger,
    store,
    openCode,
    dryRun,
  });

  if (opts.once) {
    await engine.runCycle();
    store.close();
    return;
  }

  const shutdown: ShutdownState = { requested: false };
  const requestShutdown = (signal: string) => {
    if (shutdown.requested) return;
    shutdown.requested = true;
    shutdown.signal = signal;
    logger.info("Shutdown requested", { signal });
  };

  const sigIntHandler = () => requestShutdown("SIGINT");
  const sigTermHandler = () => requestShutdown("SIGTERM");

  process.on("SIGINT", sigIntHandler);
  process.on("SIGTERM", sigTermHandler);

  try {
    await runDaemon(engine, plugins, logger, shutdown, monitor);
  } finally {
    process.off("SIGINT", sigIntHandler);
    process.off("SIGTERM", sigTermHandler);
    store.close();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[yesmand] fatal: ${message}`);
  process.exit(1);
});
