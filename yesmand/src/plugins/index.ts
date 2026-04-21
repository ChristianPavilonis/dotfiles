import { createPlugin as createGithubPRReviewsPlugin } from "./github-pr-reviews";
import { createPlugin as createGithubYesmanPlugin } from "./github";
import { createPlugin as createTelegramDemoPlugin } from "./telegram";
import type { AutomationPlugin, Logger, PluginFactory } from "../types";

const factories: PluginFactory[] = [
  createGithubYesmanPlugin,
  createGithubPRReviewsPlugin,
  createTelegramDemoPlugin,
];

function getScheduleIntervalMs(schedule: AutomationPlugin["schedule"]): number | undefined {
  if (Number.isFinite(schedule.everySeconds) && (schedule.everySeconds as number) >= 1) {
    return Number(schedule.everySeconds) * 1000;
  }

  if (Number.isFinite(schedule.everyMinutes) && (schedule.everyMinutes as number) >= 1) {
    return Number(schedule.everyMinutes) * 60 * 1000;
  }

  return undefined;
}

export async function loadPlugins(logger: Logger): Promise<AutomationPlugin[]> {
  const plugins: AutomationPlugin[] = [];

  for (const factory of factories) {
    const plugin = await factory({ logger });
    if (!plugin.id) {
      throw new Error("Plugin returned missing id");
    }

    const intervalMs = getScheduleIntervalMs(plugin.schedule);
    if (!intervalMs) {
      logger.warn("Plugin disabled due to invalid schedule", {
        plugin: plugin.id,
        everyMinutes: plugin.schedule.everyMinutes,
        everySeconds: plugin.schedule.everySeconds,
      });
      continue;
    }

    if (
      Number.isFinite(plugin.schedule.everySeconds) &&
      (plugin.schedule.everySeconds as number) >= 1 &&
      Number.isFinite(plugin.schedule.everyMinutes) &&
      (plugin.schedule.everyMinutes as number) >= 1
    ) {
      logger.warn("Plugin provided both everySeconds and everyMinutes; using everySeconds", {
        plugin: plugin.id,
        everySeconds: plugin.schedule.everySeconds,
        everyMinutes: plugin.schedule.everyMinutes,
      });
    }

    plugins.push(plugin);
    logger.info("Loaded plugin", {
      plugin: plugin.id,
      schedule: plugin.schedule,
      intervalMs,
    });
  }

  return plugins;
}
