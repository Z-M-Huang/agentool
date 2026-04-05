import { tool } from 'ai';
import { z } from 'zod';
import { join } from 'node:path';
import type { BaseToolConfig } from '../shared/types.js';
import { loadTasks, formatTask } from '../shared/task-store.js';
import { getPrompt } from './prompt.js';

export { getPrompt as taskGetPrompt } from './prompt.js';

export interface TaskGetConfig extends BaseToolConfig {
  /** Path to the tasks JSON file. Defaults to `<cwd>/.agentool/tasks.json`. */
  tasksFile?: string;
  /** Override the default tool description. */
  description?: string;
}

export function createTaskGet(config: TaskGetConfig = {}) {
  const cwd = config.cwd ?? process.cwd();
  const tasksFile = config.tasksFile ?? join(cwd, '.agentool', 'tasks.json');

  return tool({
    description: config.description ?? getPrompt(),
    inputSchema: z.object({
      taskId: z.string().describe('The ID of the task to retrieve'),
    }),
    execute: async ({ taskId }) => {
      try {
        const tasks = await loadTasks(tasksFile);
        const found = tasks.find((t) => t.id === taskId);
        if (!found) return `Error [task-get]: Task "${taskId}" not found.`;
        return formatTask(found);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [task-get]: ${msg}`;
      }
    },
  });
}

export const taskGet = createTaskGet();
