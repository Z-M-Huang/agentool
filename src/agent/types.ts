import type {
  CallSettings,
  LanguageModel,
  LanguageModelUsage,
  StopCondition,
  ToolSet,
} from 'ai';

export type AgentTaskStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'timed_out';

export interface ManagedAgentDefinition {
  /** Description shown in the tool prompt for this agent. */
  description?: string;
  /** System prompt controlled by application code. */
  systemPrompt: string;
  /** Optional model override for this agent. */
  model?: LanguageModel;
  /** Optional tool override for this agent. */
  tools?: ToolSet;
  /** Optional AI SDK stop condition override. */
  stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
  /** Agent-specific turn limit used when stopWhen is omitted. */
  maxTurns?: number;
  /** Agent-specific call settings. */
  settings?: Omit<CallSettings, 'abortSignal'>;
}

export interface AgentConfig {
  /** Default language model used by subagents. Required for start unless an agent overrides it. */
  model?: LanguageModel;
  /** Default tools available to subagents. */
  tools?: ToolSet;
  /** Named subagent registry. */
  agents?: Record<string, ManagedAgentDefinition>;
  /** Default agent name. Defaults to the first registry entry, or "default". */
  defaultAgent?: string;
  /** Maximum number of running tasks. Defaults to 4. */
  maxConcurrent?: number;
  /** Default subagent run timeout in milliseconds. Defaults to 300000. */
  defaultTimeoutMs?: number;
  /** Default wait action timeout in milliseconds. Defaults to 30000. */
  defaultWaitTimeoutMs?: number;
  /** Default wait polling interval in milliseconds. Defaults to 500. */
  defaultPollIntervalMs?: number;
  /** Maximum result characters returned to the orchestrator. Defaults to 30000. */
  maxResultChars?: number;
  /** Default AI SDK stop condition override. */
  stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
  /** Default turn limit used when stopWhen is omitted. Defaults to 20. */
  maxTurns?: number;
  /** Default call settings for child generateText calls. */
  settings?: Omit<CallSettings, 'abortSignal'>;
  /** Override the default tool description. */
  description?: string;
}

export type AgentTask = {
  id: string;
  agentName: string;
  description?: string;
  prompt: string;
  status: AgentTaskStatus;
  startTime: number;
  endTime?: number;
  result?: string;
  error?: string;
  usage?: LanguageModelUsage;
  abortController: AbortController;
  promise: Promise<void>;
  timeoutId?: ReturnType<typeof setTimeout>;
};

export type SelectedAgent = {
  name: string;
  definition: ManagedAgentDefinition;
};

export type WaitMode = 'all' | 'any';
