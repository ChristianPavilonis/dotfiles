import { createPlugin as createGithubPRReviewsPlugin } from "./github-pr-reviews";
import { createPlugin as createGithubYesmanPlugin } from "./github";
import type { AutomationPlugin, Logger, PluginFactory } from "../types";

const factories: PluginFactory[] = [
  createGithubYesmanPlugin,
  createGithubPRReviewsPlugin,
];

export async function loadPlugins(logger: Logger): Promise<AutomationPlugin[]> {
  const plugins: AutomationPlugin[] = [];

  for (const factory of factories) {
    const plugin = await factory({ logger });
    if (!plugin.id) {
      throw new Error("Plugin returned missing id");
    }

    if (!Number.isFinite(plugin.schedule.everyMinutes) || plugin.schedule.everyMinutes < 1) {
      logger.warn("Plugin disabled due to invalid schedule", {
        plugin: plugin.id,
        everyMinutes: plugin.schedule.everyMinutes,
      });
      continue;
    }

    plugins.push(plugin);
    logger.info("Loaded plugin", {
      plugin: plugin.id,
      schedule: plugin.schedule,
    });
  }

  return plugins;
}
