export type DispatchPhase = "plan" | "implementation";

export type DispatchAttemptStatus =
  | "dispatch_started"
  | "dispatch_sent"
  | "running"
  | "completed"
  | "failed"
  | "stalled"
  | "timed_out";

export interface Logger {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
  debug(message: string, details?: Record<string, unknown>): void;
}

export interface WorkItem {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt?: string;
  metadata: Record<string, unknown>;
}

export interface DispatchDecision {
  kind: "dispatch";
  phase: DispatchPhase;
  dedupeKey: string;
  sessionTitle: string;
  directory: string;
  prompt: string;
  continueFromDedupeKey?: string;
  metadata?: Record<string, unknown>;
}

export interface WaitDecision {
  kind: "wait";
  reason: string;
}

export interface SkipDecision {
  kind: "skip";
  reason: string;
}

export interface DoneDecision {
  kind: "done";
  reason: string;
}

export type EvaluationResult =
  | DispatchDecision
  | WaitDecision
  | SkipDecision
  | DoneDecision;

export interface PluginContext {
  dryRun: boolean;
  logger: Logger;
  now: Date;
}

export interface PluginSchedule {
  everyMinutes: number;
  runOnStartup?: boolean;
  jitterSeconds?: number;
}

export interface AutomationPlugin {
  id: string;
  schedule: PluginSchedule;
  discoverCandidates(ctx: PluginContext): Promise<WorkItem[]>;
  evaluateCandidate(item: WorkItem, ctx: PluginContext): Promise<EvaluationResult>;
  onDispatchSuccess?(
    item: WorkItem,
    decision: DispatchDecision,
    sessionId: string,
    ctx: PluginContext
  ): Promise<void>;
  onDispatchFailure?(
    item: WorkItem,
    decision: DispatchDecision,
    error: string,
    ctx: PluginContext
  ): Promise<void>;
}

export interface PluginFactoryContext {
  logger: Logger;
}

export type PluginFactory = (
  ctx: PluginFactoryContext
) => Promise<AutomationPlugin> | AutomationPlugin;

export interface AppConfig {
  dryRun: boolean;
  databasePath: string;
  monitor: {
    enabled: boolean;
    pollSeconds: number;
    stalledAfterMinutes: number;
    timeoutAfterMinutes: number;
  };
  opencode: {
    url: string;
    username: string;
    password: string;
    model: string;
  };
}
