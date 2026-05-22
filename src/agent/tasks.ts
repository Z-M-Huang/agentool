import { DEFAULT_AGENT_NAME, fallbackAgent } from './constants.js';
import type { AgentConfig, AgentTask, SelectedAgent } from './types.js';

export function activeTaskCount(tasks: Map<string, AgentTask>): number {
  let count = 0;
  for (const task of tasks.values()) {
    if (task.status === 'running') count++;
  }
  return count;
}

export function selectAgent(
  config: AgentConfig,
  requestedName?: string,
): SelectedAgent | string {
  const registry = config.agents ?? {};
  const registryNames = Object.keys(registry);
  const name =
    requestedName ??
    config.defaultAgent ??
    registryNames[0] ??
    DEFAULT_AGENT_NAME;

  const definition =
    registry[name] ??
    (name === DEFAULT_AGENT_NAME && registryNames.length === 0
      ? fallbackAgent
      : undefined);

  if (!definition) {
    const available =
      registryNames.length > 0 ? registryNames.join(', ') : DEFAULT_AGENT_NAME;
    return `Unknown agent "${name}". Available agents: ${available}.`;
  }

  return { name, definition };
}

export function getWaitTargets(
  tasks: Map<string, AgentTask>,
  taskIds: string[] | undefined,
): AgentTask[] | string {
  if (taskIds && taskIds.length > 0) {
    const selected: AgentTask[] = [];
    const missing: string[] = [];
    for (const taskId of taskIds) {
      const task = tasks.get(taskId);
      if (task) selected.push(task);
      else missing.push(taskId);
    }
    if (missing.length > 0) {
      return `Unknown task id(s): ${missing.join(', ')}.`;
    }
    return selected;
  }

  return Array.from(tasks.values()).filter((task) => task.status === 'running');
}

export function stopTask(
  task: AgentTask,
  status: 'stopped' | 'timed_out',
  error: string,
): void {
  if (task.status !== 'running') return;
  task.status = status;
  task.error = error;
  task.endTime = Date.now();
  if (task.timeoutId) {
    clearTimeout(task.timeoutId);
    task.timeoutId = undefined;
  }
  task.abortController.abort();
}
