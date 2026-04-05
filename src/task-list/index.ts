import { tool } from 'ai';
import { z } from 'zod';
import { join } from 'node:path';
import type { BaseToolConfig } from '../shared/types.js';
import { loadTasks, formatTaskSummary } from '../shared/task-store.js';

export interface TaskListConfig extends BaseToolConfig {
  /** Path to the tasks JSON file. Defaults to `<cwd>/.agentool/tasks.json`. */
  tasksFile?: string;
}

export function createTaskList(config: TaskListConfig = {}) {
  const cwd = config.cwd ?? process.cwd();
  const tasksFile = config.tasksFile ?? join(cwd, '.agentool', 'tasks.json');

  return tool({
    description: 'List all tasks with their status, owner, and dependencies.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const tasks = await loadTasks(tasksFile);
        const visible = tasks.filter((t) => t.status !== 'deleted');
        if (visible.length === 0) return 'No tasks found.';
        return visible.map(formatTaskSummary).join('\n');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [task-list]: ${msg}`;
      }
    },
  });
}

export const taskList = createTaskList();
