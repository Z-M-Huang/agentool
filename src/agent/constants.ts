import type { AgentTaskStatus, ManagedAgentDefinition } from './types.js';

export const DEFAULT_AGENT_NAME = 'default';
export const DEFAULT_MAX_CONCURRENT = 4;
export const DEFAULT_RUN_TIMEOUT_MS = 300_000;
export const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
export const DEFAULT_POLL_INTERVAL_MS = 500;
export const DEFAULT_RESULT_CHARS = 30_000;
export const DEFAULT_MAX_TURNS = 20;

export const terminalStatuses = new Set<AgentTaskStatus>([
  'completed',
  'failed',
  'stopped',
  'timed_out',
]);

export const fallbackAgent: ManagedAgentDefinition = {
  description: 'General purpose subagent',
  systemPrompt:
    'You are a focused subagent. Complete the delegated task and report concise findings back to the orchestrator.',
};
