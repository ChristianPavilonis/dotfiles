import type {
  AutomationPlugin,
  DispatchDecision,
  Logger,
  PluginContext,
  WorkItem,
} from "./types";
import { OpenCodeClient } from "./opencode-client";
import { DispatchStore } from "./store";

interface EngineOptions {
  plugins: AutomationPlugin[];
  logger: Logger;
  store: DispatchStore;
  openCode: OpenCodeClient;
  dryRun: boolean;
}

export class AutomationEngine {
  private readonly plugins: AutomationPlugin[];
  private readonly logger: Logger;
  private readonly store: DispatchStore;
  private readonly openCode: OpenCodeClient;
  private readonly dryRun: boolean;

  constructor(options: EngineOptions) {
    this.plugins = options.plugins;
    this.logger = options.logger;
    this.store = options.store;
    this.openCode = options.openCode;
    this.dryRun = options.dryRun;
  }

  async runCycle(): Promise<void> {
    const ctx: PluginContext = {
      dryRun: this.dryRun,
      logger: this.logger,
      now: new Date(),
    };

    this.logger.info("Starting poll cycle", {
      pluginCount: this.plugins.length,
      dryRun: this.dryRun,
    });

    if (!this.dryRun) {
      const healthy = await this.openCode.healthcheck();
      if (!healthy) {
        this.logger.warn("OpenCode unavailable. Skipping this cycle.");
        return;
      }
    }

    for (const plugin of this.plugins) {
      try {
        await this.runPlugin(plugin, ctx);
      } catch (error) {
        this.logger.error("Plugin run failed", {
          plugin: plugin.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info("Poll cycle complete");
  }

  private async runPlugin(plugin: AutomationPlugin, ctx: PluginContext): Promise<void> {
    this.logger.info("Running plugin", { plugin: plugin.id });

    const items = await plugin.discoverCandidates(ctx);
    this.logger.info("Plugin discovered candidates", {
      plugin: plugin.id,
      count: items.length,
    });

    for (const item of items) {
      await this.handleItem(plugin, item, ctx);
    }
  }

  private async handleItem(
    plugin: AutomationPlugin,
    item: WorkItem,
    ctx: PluginContext
  ): Promise<void> {
    try {
      const evaluation = await plugin.evaluateCandidate(item, ctx);

      if (evaluation.kind !== "dispatch") {
        this.logger.debug("Item not dispatched", {
          plugin: plugin.id,
          itemId: item.id,
          kind: evaluation.kind,
          reason: evaluation.reason,
        });
        return;
      }

      await this.dispatchItem(plugin, item, evaluation, ctx);
    } catch (error) {
      this.logger.error("Failed handling item", {
        plugin: plugin.id,
        itemId: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async dispatchItem(
    plugin: AutomationPlugin,
    item: WorkItem,
    decision: DispatchDecision,
    ctx: PluginContext
  ): Promise<void> {
    if (this.store.hasDispatch(decision.dedupeKey)) {
      this.logger.info("Skipping already-dispatched decision", {
        plugin: plugin.id,
        itemId: item.id,
        dedupeKey: decision.dedupeKey,
        phase: decision.phase,
      });
      return;
    }

    if (this.dryRun) {
      this.logger.info("Dry-run dispatch", {
        plugin: plugin.id,
        itemId: item.id,
        phase: decision.phase,
        dedupeKey: decision.dedupeKey,
        directory: decision.directory,
      });
      return;
    }

    try {
      let sessionId: string | undefined;

      if (decision.continueFromDedupeKey) {
        const existingSessionId = this.store.getSessionIdByDedupeKey(
          decision.continueFromDedupeKey
        );

        if (existingSessionId) {
          await this.openCode.promptInSession({
            sessionId: existingSessionId,
            directory: decision.directory,
            prompt: decision.prompt,
          });
          sessionId = existingSessionId;

          this.logger.info("Continued existing OpenCode session", {
            plugin: plugin.id,
            itemId: item.id,
            phase: decision.phase,
            sessionId,
            continueFromDedupeKey: decision.continueFromDedupeKey,
          });
        } else {
          this.logger.warn("Could not find prior session for continuation; creating new session", {
            plugin: plugin.id,
            itemId: item.id,
            phase: decision.phase,
            continueFromDedupeKey: decision.continueFromDedupeKey,
          });
        }
      }

      if (!sessionId) {
        sessionId = await this.openCode.dispatch({
          directory: decision.directory,
          sessionTitle: decision.sessionTitle,
          prompt: decision.prompt,
        });
      }

      this.store.recordDispatch({
        pluginId: plugin.id,
        itemId: item.id,
        phase: decision.phase,
        dedupeKey: decision.dedupeKey,
        sessionId,
        model: this.openCode.modelId,
      });

      this.logger.info("Dispatched OpenCode session", {
        plugin: plugin.id,
        itemId: item.id,
        phase: decision.phase,
        sessionId,
      });

      if (plugin.onDispatchSuccess) {
        await plugin.onDispatchSuccess(item, decision, sessionId, ctx);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error("Dispatch failed", {
        plugin: plugin.id,
        itemId: item.id,
        phase: decision.phase,
        error: message,
      });

      if (plugin.onDispatchFailure) {
        await plugin.onDispatchFailure(item, decision, message, ctx);
      }
    }
  }
}
