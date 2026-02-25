export type DispatchPhase = "plan" | "implementation";

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

export interface AutomationPlugin {
  id: string;
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
  config: unknown,
  ctx: PluginFactoryContext
) => Promise<AutomationPlugin> | AutomationPlugin;

export interface PluginDefinition {
  id: string;
  modulePath: string;
  config: unknown;
  enabled: boolean;
}

export interface AppConfig {
  pollIntervalMinutes: number;
  dryRun: boolean;
  databasePath: string;
  opencode: {
    url: string;
    username: string;
    password: string;
    model: string;
  };
  plugins: PluginDefinition[];
}
