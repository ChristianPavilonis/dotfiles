import { OpenCodeClient } from "./opencode-client";
import { DispatchStore, type ActiveDispatchAttempt } from "./store";
import type { DispatchAttemptStatus, Logger } from "./types";

interface SessionMonitorOptions {
  logger: Logger;
  store: DispatchStore;
  openCode: OpenCodeClient;
  stalledAfterMinutes: number;
  timeoutAfterMinutes: number;
}

interface StatusAssessment {
  status: DispatchAttemptStatus;
  reason: string | null;
  endAttempt: boolean;
  lastMessageId: string | null;
  lastTool: string | null;
  lastToolStatus: string | null;
  sessionId: string | null;
}

function parseIsoMs(input: string | null): number | undefined {
  if (!input) return undefined;
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isTerminalStatus(status: DispatchAttemptStatus): boolean {
  return status === "completed" || status === "failed" || status === "stalled" || status === "timed_out";
}

export class SessionMonitor {
  private readonly logger: Logger;
  private readonly store: DispatchStore;
  private readonly openCode: OpenCodeClient;
  private readonly stalledAfterMs: number;
  private readonly timeoutAfterMs: number;

  constructor(options: SessionMonitorOptions) {
    this.logger = options.logger;
    this.store = options.store;
    this.openCode = options.openCode;
    this.stalledAfterMs = options.stalledAfterMinutes * 60 * 1000;
    this.timeoutAfterMs = options.timeoutAfterMinutes * 60 * 1000;
  }

  async tick(): Promise<void> {
    const active = this.store.listActiveDispatchAttempts();
    if (active.length === 0) return;

    this.logger.debug("Monitoring active dispatch attempts", {
      count: active.length,
    });

    for (const attempt of active) {
      await this.inspectAttempt(attempt);
    }
  }

  private async inspectAttempt(attempt: ActiveDispatchAttempt): Promise<void> {
    const nowMs = Date.now();
    const startedAtMs = parseIsoMs(attempt.startedAt) ?? nowMs;
    const ageMs = Math.max(0, nowMs - startedAtMs);

    if (ageMs >= this.timeoutAfterMs) {
      this.applyStatusIfChanged(attempt, {
        status: "timed_out",
        reason: `Attempt exceeded timeout window (${Math.round(this.timeoutAfterMs / 60000)}m)`,
        endAttempt: true,
        lastMessageId: attempt.lastMessageId,
        lastTool: attempt.lastTool,
        lastToolStatus: attempt.lastToolStatus,
        sessionId: attempt.sessionId,
      });
      return;
    }

    if (!attempt.sessionId) {
      if (ageMs >= this.stalledAfterMs) {
        this.applyStatusIfChanged(attempt, {
          status: "failed",
          reason: "Dispatch attempt missing session ID after stall threshold",
          endAttempt: true,
          lastMessageId: attempt.lastMessageId,
          lastTool: attempt.lastTool,
          lastToolStatus: attempt.lastToolStatus,
          sessionId: null,
        });
      }
      return;
    }

    try {
      const [session, messages] = await Promise.all([
        this.openCode.getSession(attempt.sessionId),
        this.openCode.getSessionMessages(attempt.sessionId),
      ]);

      const lastMessage = messages.at(-1);
      const info = lastMessage?.info;
      const parts = lastMessage?.parts ?? [];
      const lastPart = parts.at(-1);

      const lastMessageId = info?.id ?? null;
      const finish = info?.finish ?? null;
      const lastTool = lastPart?.type === "tool" ? lastPart.tool ?? null : null;
      const lastToolStatus = lastPart?.type === "tool" ? lastPart.state?.status ?? null : null;

      const toolStartMs = safeMs(lastPart?.state?.time?.start);
      const sessionUpdatedMs = safeMs(session.time?.updated);
      const messageCreatedMs = safeMs(info?.time?.created);
      const stagnantSinceMs = toolStartMs ?? sessionUpdatedMs ?? messageCreatedMs ?? startedAtMs;
      const stagnantForMs = Math.max(0, nowMs - stagnantSinceMs);

      const assessment: StatusAssessment = {
        status: "running",
        reason: null,
        endAttempt: false,
        lastMessageId,
        lastTool,
        lastToolStatus,
        sessionId: attempt.sessionId,
      };

      if (finish === "stop") {
        assessment.status = "completed";
        assessment.reason = "Assistant returned terminal stop";
        assessment.endAttempt = true;
      } else if (finish && finish !== "tool-calls") {
        assessment.status = "failed";
        assessment.reason = `Assistant finished with non-stop reason '${finish}'`;
        assessment.endAttempt = true;
      } else if (lastPart?.type === "tool" && lastToolStatus === "error") {
        assessment.status = "failed";
        assessment.reason = `Tool '${lastTool ?? "unknown"}' reported error state`;
        assessment.endAttempt = true;
      } else if (stagnantForMs >= this.stalledAfterMs) {
        assessment.status = "stalled";
        assessment.reason = `No progress for ${Math.round(stagnantForMs / 60000)}m`;
        assessment.endAttempt = true;
      }

      this.applyStatusIfChanged(attempt, assessment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Session monitor API probe failed", {
        dedupeKey: attempt.dedupeKey,
        attempt: attempt.attempt,
        sessionId: attempt.sessionId,
        error: message,
      });

      if (ageMs >= this.stalledAfterMs) {
        this.applyStatusIfChanged(attempt, {
          status: "failed",
          reason: `Session API probe failed after stall threshold: ${message}`,
          endAttempt: true,
          lastMessageId: attempt.lastMessageId,
          lastTool: attempt.lastTool,
          lastToolStatus: attempt.lastToolStatus,
          sessionId: attempt.sessionId,
        });
      }
    }
  }

  private applyStatusIfChanged(attempt: ActiveDispatchAttempt, next: StatusAssessment): void {
    const changed =
      attempt.status !== next.status ||
      attempt.reason !== next.reason ||
      attempt.lastMessageId !== next.lastMessageId ||
      attempt.lastTool !== next.lastTool ||
      attempt.lastToolStatus !== next.lastToolStatus ||
      attempt.sessionId !== next.sessionId;

    if (!changed) return;

    this.store.updateDispatchAttemptStatus({
      dedupeKey: attempt.dedupeKey,
      attempt: attempt.attempt,
      status: next.status,
      reason: next.reason,
      lastMessageId: next.lastMessageId,
      lastTool: next.lastTool,
      lastToolStatus: next.lastToolStatus,
      sessionId: next.sessionId,
      endAttempt: next.endAttempt,
    });

    const detail = {
      plugin: attempt.pluginId,
      itemId: attempt.itemId,
      phase: attempt.phase,
      dedupeKey: attempt.dedupeKey,
      attempt: attempt.attempt,
      sessionId: next.sessionId,
      status: next.status,
      reason: next.reason,
      lastMessageId: next.lastMessageId,
      lastTool: next.lastTool,
      lastToolStatus: next.lastToolStatus,
      terminal: isTerminalStatus(next.status),
    };

    if (next.status === "completed") {
      this.logger.info("Dispatch attempt completed", detail);
      return;
    }

    if (next.status === "failed" || next.status === "stalled" || next.status === "timed_out") {
      this.logger.warn("Dispatch attempt reached terminal non-success state", detail);
      return;
    }

    this.logger.info("Dispatch attempt status updated", detail);
  }
}
