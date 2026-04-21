import type {
  AutomationPlugin,
  DispatchDecision,
  Logger,
  PluginStateStore,
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

  private createPluginState(pluginId: string): PluginStateStore {
    return {
      get: (key: string) => this.store.getPluginState(pluginId, key),
      set: (key: string, value: string) => {
        this.store.setPluginState(pluginId, key, value);
      },
      delete: (key: string) => {
        this.store.deletePluginState(pluginId, key);
      },
      getJson: <T>(key: string): T | undefined => {
        const raw = this.store.getPluginState(pluginId, key);
        if (!raw) return undefined;
        try {
          return JSON.parse(raw) as T;
        } catch {
          return undefined;
        }
      },
      setJson: (key: string, value: unknown) => {
        this.store.setPluginState(pluginId, key, JSON.stringify(value));
      },
    };
  }

  private createPluginContext(pluginId: string, now = new Date()): PluginContext {
    return {
      dryRun: this.dryRun,
      logger: this.logger,
      now,
      state: this.createPluginState(pluginId),
    };
  }

  private async isBackendAvailable(): Promise<boolean> {
    if (this.dryRun) return true;

    const healthy = await this.openCode.healthcheck();
    return healthy;
  }

  async runCycle(): Promise<void> {
    this.logger.info("Starting poll cycle", {
      pluginCount: this.plugins.length,
      dryRun: this.dryRun,
    });

    if (!(await this.isBackendAvailable())) {
      this.logger.warn("OpenCode unavailable. Skipping this cycle.");
      return;
    }

    for (const plugin of this.plugins) {
      const ctx = this.createPluginContext(plugin.id);
      await this.runPluginCycle(plugin, ctx);
    }

    this.logger.info("Poll cycle complete");
  }

  async runPluginCycle(plugin: AutomationPlugin, ctx?: PluginContext): Promise<void> {
    if (!(await this.isBackendAvailable())) {
      this.logger.warn("Skipping plugin because OpenCode is unavailable", {
        plugin: plugin.id,
      });
      return;
    }

    const runCtx: PluginContext =
      ctx ?? this.createPluginContext(plugin.id);

    try {
      await this.runPlugin(plugin, runCtx);
    } catch (error) {
      this.logger.error("Plugin run failed", {
        plugin: plugin.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

    const attempt = this.store.startDispatchAttempt({
      pluginId: plugin.id,
      itemId: item.id,
      phase: decision.phase,
      dedupeKey: decision.dedupeKey,
    });

    this.logger.info("Dispatch attempt started", {
      plugin: plugin.id,
      itemId: item.id,
      phase: decision.phase,
      dedupeKey: decision.dedupeKey,
      attempt,
    });

    let sessionId: string | undefined;

    try {
      if (decision.continueFromDedupeKey) {
        const existingSessionId = this.store.getSessionIdByDedupeKey(
          decision.continueFromDedupeKey
        );

        if (existingSessionId) {
          sessionId = existingSessionId;
          await this.openCode.promptInSession({
            sessionId: existingSessionId,
            directory: decision.directory,
            prompt: decision.prompt,
          });

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
        metadata: decision.metadata,
      });

      this.store.updateDispatchAttemptStatus({
        dedupeKey: decision.dedupeKey,
        attempt,
        status: "dispatch_sent",
        sessionId,
        reason: null,
      });

      this.logger.info("Dispatched OpenCode session", {
        plugin: plugin.id,
        itemId: item.id,
        phase: decision.phase,
        sessionId,
        dedupeKey: decision.dedupeKey,
        attempt,
      });

      if (plugin.onDispatchSuccess) {
        await plugin.onDispatchSuccess(item, decision, sessionId, ctx);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.store.updateDispatchAttemptStatus({
        dedupeKey: decision.dedupeKey,
        attempt,
        status: "failed",
        sessionId: sessionId ?? null,
        reason: message,
        endAttempt: true,
      });

      this.logger.error("Dispatch failed", {
        plugin: plugin.id,
        itemId: item.id,
        phase: decision.phase,
        dedupeKey: decision.dedupeKey,
        attempt,
        sessionId,
        error: message,
      });

      if (plugin.onDispatchFailure) {
        await plugin.onDispatchFailure(item, decision, message, ctx);
      }
    }
  }
}
