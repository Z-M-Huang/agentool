import { generateText, stepCountIs, tool } from 'ai';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { extractErrorMessage } from '../shared/errors.js';
import {
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_MAX_TURNS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_RESULT_CHARS,
  DEFAULT_RUN_TIMEOUT_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
} from './constants.js';
import {
  formatTaskResult,
  formatTaskSummary,
  formatWaitResult,
  isTerminal,
} from './format.js';
import { getPrompt } from './prompt.js';
import { inputSchema } from './schema.js';
import type { AgentInput } from './schema.js';
import {
  activeTaskCount,
  getWaitTargets,
  selectAgent,
  stopTask,
} from './tasks.js';
import { markAgentTool, removeAgentTools } from './tools.js';
import type { AgentConfig, AgentTask } from './types.js';

export { getPrompt as agentPrompt } from './prompt.js';
export type {
  AgentConfig,
  AgentTaskStatus,
  ManagedAgentDefinition,
} from './types.js';

/**
 * Creates a managed subagent tool.
 *
 * The tool keeps task state in memory for the lifetime of the returned tool
 * instance. Child runs use configured model/tools and registry-controlled
 * system prompts; parent messages are intentionally not forwarded.
 */
export function createAgent(config: AgentConfig = {}) {
  const tasks = new Map<string, AgentTask>();
  const maxConcurrent = config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const defaultRunTimeoutMs =
    config.defaultTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  const defaultWaitTimeoutMs =
    config.defaultWaitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const defaultPollIntervalMs =
    config.defaultPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxResultChars = config.maxResultChars ?? DEFAULT_RESULT_CHARS;

  function startTask(input: Extract<AgentInput, { action: 'start' }>): string {
    if (activeTaskCount(tasks) >= maxConcurrent) {
      return `Error [agent]: Max concurrent subagents reached (${maxConcurrent}). Use wait, result, or stop before starting more.`;
    }

    const selected = selectAgent(config, input.agent);
    if (typeof selected === 'string') {
      return `Error [agent]: ${selected}`;
    }

    const model = selected.definition.model ?? config.model;
    if (!model) {
      return 'Error [agent]: No model configured. Provide createAgent({ model }) or an agent-specific model.';
    }

    const taskId = `agent_${randomUUID()}`;
    const abortController = new AbortController();
    const timeoutMs = input.timeoutMs ?? defaultRunTimeoutMs;
    const task: AgentTask = {
      id: taskId,
      agentName: selected.name,
      description: input.description,
      prompt: input.prompt,
      status: 'running',
      startTime: Date.now(),
      abortController,
      promise: Promise.resolve(),
    };
    tasks.set(taskId, task);

    task.timeoutId = setTimeout(() => {
      stopTask(
        task,
        'timed_out',
        `Subagent timed out after ${timeoutMs}ms.`,
      );
    }, timeoutMs);

    task.promise = (async () => {
      try {
        const maxTurns =
          selected.definition.maxTurns ?? config.maxTurns ?? DEFAULT_MAX_TURNS;
        const stopWhen =
          selected.definition.stopWhen ?? config.stopWhen ?? stepCountIs(maxTurns);
        const result = await generateText({
          ...(config.settings ?? {}),
          ...(selected.definition.settings ?? {}),
          model,
          tools: removeAgentTools(selected.definition.tools ?? config.tools),
          system: selected.definition.systemPrompt,
          prompt: input.prompt,
          stopWhen,
          abortSignal: abortController.signal,
        });

        if (task.status === 'running') {
          task.status = 'completed';
          task.result = result.text;
          task.usage = result.usage;
          task.endTime = Date.now();
        }
      } catch (error: unknown) {
        if (task.status === 'running') {
          task.status = 'failed';
          task.error = extractErrorMessage(error);
          task.endTime = Date.now();
        }
      } finally {
        if (task.timeoutId) {
          clearTimeout(task.timeoutId);
          task.timeoutId = undefined;
        }
      }
    })();

    return `Started subagent task ${taskId}.
Agent: ${selected.name}
Status: running
Use wait with taskIds ["${taskId}"] or wait for all running tasks.`;
  }

  async function waitForTasks(
    input: Extract<AgentInput, { action: 'wait' }>,
    abortSignal: AbortSignal | undefined,
  ): Promise<string> {
    const targets = getWaitTargets(tasks, input.taskIds);
    if (typeof targets === 'string') return `Error [agent]: ${targets}`;
    if (targets.length === 0) {
      return 'No running or selected subagent tasks to wait for.';
    }

    const mode = input.mode;
    const timeoutMs = input.timeoutMs ?? defaultWaitTimeoutMs;
    const pollIntervalMs = input.pollIntervalMs ?? defaultPollIntervalMs;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const completed = targets.filter(isTerminal);
      const done =
        mode === 'any'
          ? completed.length > 0
          : completed.length === targets.length;
      if (done) {
        return formatWaitResult(targets, mode, false, maxResultChars);
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return formatWaitResult(targets, mode, true, maxResultChars);
      }

      await sleep(Math.min(pollIntervalMs, remainingMs), undefined, {
        signal: abortSignal,
      });
    }
  }

  return markAgentTool(tool({
    description: config.description ?? getPrompt(config),
    inputSchema,
    execute: async (input, options) => {
      try {
        switch (input.action) {
          case 'start':
            return startTask(input);
          case 'wait':
            return await waitForTasks(input, options.abortSignal);
          case 'status': {
            const task = tasks.get(input.taskId);
            return task
              ? formatTaskSummary(task)
              : `Error [agent]: Unknown task id "${input.taskId}".`;
          }
          case 'result': {
            const task = tasks.get(input.taskId);
            return task
              ? formatTaskResult(task, maxResultChars)
              : `Error [agent]: Unknown task id "${input.taskId}".`;
          }
          case 'list': {
            if (tasks.size === 0) return 'No subagent tasks have been started.';
            return Array.from(tasks.values())
              .sort((a, b) => a.startTime - b.startTime)
              .map(formatTaskSummary)
              .join('\n\n');
          }
          case 'stop': {
            const task = tasks.get(input.taskId);
            if (!task) return `Error [agent]: Unknown task id "${input.taskId}".`;
            if (task.status !== 'running') {
              return `Task ${task.id} is already ${task.status}.`;
            }
            stopTask(task, 'stopped', 'Subagent stopped by orchestrator.');
            return `Stopped subagent task ${task.id}.`;
          }
        }
      } catch (error: unknown) {
        return `Error [agent]: ${extractErrorMessage(error)}`;
      }
    },
  }));
}

/**
 * Default agent tool instance. Configure a model with createAgent({ model }).
 */
export const agent = createAgent();
