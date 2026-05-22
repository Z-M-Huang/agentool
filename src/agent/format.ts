import { terminalStatuses } from './constants.js';
import type { AgentTask, WaitMode } from './types.js';

export function isTerminal(task: AgentTask): boolean {
  return terminalStatuses.has(task.status);
}

function truncateResult(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const omitted = value.length - maxChars;
  return `${value.slice(0, maxChars)}\n... [agent result truncated - ${omitted} chars removed]`;
}

function formatUsage(usage: AgentTask['usage']): string {
  if (!usage) return '';
  const parts = [
    usage.inputTokens === undefined ? undefined : `input=${usage.inputTokens}`,
    usage.outputTokens === undefined ? undefined : `output=${usage.outputTokens}`,
    usage.totalTokens === undefined ? undefined : `total=${usage.totalTokens}`,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? `\nUsage: ${parts.join(', ')}` : '';
}

export function formatTaskSummary(task: AgentTask): string {
  const elapsedMs = (task.endTime ?? Date.now()) - task.startTime;
  const label = task.description ? ` (${task.description})` : '';
  const error = task.error ? `\nError: ${task.error}` : '';
  return `Task ${task.id}${label}
Agent: ${task.agentName}
Status: ${task.status}
Elapsed: ${elapsedMs}ms${formatUsage(task.usage)}${error}`;
}

export function formatTaskResult(task: AgentTask, maxResultChars: number): string {
  const summary = formatTaskSummary(task);
  if (task.status === 'completed') {
    return `${summary}\nResult:\n${truncateResult(task.result ?? '', maxResultChars)}`;
  }
  if (task.status === 'running') {
    return `${summary}\nResult is not ready yet. Use wait or status later.`;
  }
  return summary;
}

export function formatWaitResult(
  tasks: AgentTask[],
  mode: WaitMode,
  timedOut: boolean,
  maxResultChars: number,
): string {
  const completed = tasks.filter(isTerminal);
  const running = tasks.filter((task) => task.status === 'running');
  const header = timedOut
    ? `Wait timed out. ${completed.length}/${tasks.length} selected task(s) finished.`
    : `Wait complete (${mode}). ${completed.length}/${tasks.length} selected task(s) finished.`;
  const sections = completed.map((task) => formatTaskResult(task, maxResultChars));
  const runningLines = running.map(
    (task) => `Task ${task.id}: running${task.description ? ` (${task.description})` : ''}`,
  );
  return [header, ...sections, ...runningLines].join('\n\n');
}
