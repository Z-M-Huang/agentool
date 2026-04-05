import { tool } from 'ai';
import { z } from 'zod';
import { join } from 'node:path';
import type { BaseToolConfig } from '../shared/types.js';
import { generateId, loadTasks, saveTasks, formatTask, type Task } from '../shared/task-store.js';
import { extractErrorMessage } from '../shared/errors.js';
import { getPrompt } from './prompt.js';

export { getPrompt as taskCreatePrompt } from './prompt.js';

export interface TaskCreateConfig extends BaseToolConfig {
  /** Path to the tasks JSON file. Defaults to `<cwd>/.agentool/tasks.json`. */
  tasksFile?: string;
  /** Override the default tool description. */
  description?: string;
}

export function createTaskCreate(config: TaskCreateConfig = {}) {
  const cwd = config.cwd ?? process.cwd();
  const tasksFile = config.tasksFile ?? join(cwd, '.agentool', 'tasks.json');

  return tool({
    description: config.description ?? getPrompt(),
    inputSchema: z.object({
      subject: z.string().describe('A brief title for the task'),
      description: z.string().describe('What needs to be done'),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Arbitrary metadata to attach to the task'),
    }),
    execute: async ({ subject, description, metadata }) => {
      try {
        const tasks = await loadTasks(tasksFile);
        const now = new Date().toISOString();
        const entry: Task = {
          id: generateId(),
          subject,
          description,
          status: 'pending',
          blocks: [],
          blockedBy: [],
          metadata,
          createdAt: now,
          updatedAt: now,
        };
        tasks.push(entry);
        await saveTasks(tasksFile, tasks);
        return `Created task ${entry.id}.\n${formatTask(entry)}`;
      } catch (error: unknown) {
        const msg = extractErrorMessage(error);
        return `Error [task-create]: ${msg}`;
      }
    },
  });
}

export const taskCreate = createTaskCreate();
