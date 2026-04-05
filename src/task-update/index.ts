import { tool } from 'ai';
import { z } from 'zod';
import { join } from 'node:path';
import type { BaseToolConfig } from '../shared/types.js';
import { loadTasks, saveTasks, formatTask } from '../shared/task-store.js';
import { extractErrorMessage } from '../shared/errors.js';
import { getPrompt } from './prompt.js';

export { getPrompt as taskUpdatePrompt } from './prompt.js';

export interface TaskUpdateConfig extends BaseToolConfig {
  /** Path to the tasks JSON file. Defaults to `<cwd>/.agentool/tasks.json`. */
  tasksFile?: string;
  /** Override the default tool description. */
  description?: string;
}

export function createTaskUpdate(config: TaskUpdateConfig = {}) {
  const cwd = config.cwd ?? process.cwd();
  const tasksFile = config.tasksFile ?? join(cwd, '.agentool', 'tasks.json');

  return tool({
    description: config.description ?? getPrompt(),
    inputSchema: z.object({
      taskId: z.string().describe('The ID of the task to update'),
      subject: z.string().optional().describe('New subject for the task'),
      description: z.string().optional().describe('New description'),
      status: z
        .enum(['pending', 'in_progress', 'completed', 'deleted'])
        .optional()
        .describe('New status for the task'),
      owner: z.string().optional().describe('New owner for the task'),
      activeForm: z
        .string()
        .optional()
        .describe('Present continuous form shown in spinner when in_progress'),
      addBlocks: z
        .array(z.string())
        .optional()
        .describe('Task IDs that this task blocks'),
      addBlockedBy: z
        .array(z.string())
        .optional()
        .describe('Task IDs that block this task'),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Metadata keys to merge. Set key to null to delete.'),
    }),
    execute: async (input) => {
      try {
        const tasks = await loadTasks(tasksFile);
        const idx = tasks.findIndex((t) => t.id === input.taskId);
        if (idx === -1) return `Error [task-update]: Task "${input.taskId}" not found.`;

        const entry = tasks[idx];

        if (input.subject !== undefined) entry.subject = input.subject;
        if (input.description !== undefined) entry.description = input.description;
        if (input.status !== undefined) entry.status = input.status;
        if (input.owner !== undefined) entry.owner = input.owner;
        if (input.activeForm !== undefined) entry.activeForm = input.activeForm;

        // Append to blocks/blockedBy arrays (no duplicates)
        if (input.addBlocks) {
          for (const id of input.addBlocks) {
            if (!entry.blocks.includes(id)) entry.blocks.push(id);
          }
        }
        if (input.addBlockedBy) {
          for (const id of input.addBlockedBy) {
            if (!entry.blockedBy.includes(id)) entry.blockedBy.push(id);
          }
        }

        // Merge metadata: null values delete keys
        if (input.metadata) {
          if (!entry.metadata) entry.metadata = {};
          for (const [key, value] of Object.entries(input.metadata)) {
            if (value === null) {
              delete entry.metadata[key];
            } else {
              entry.metadata[key] = value;
            }
          }
        }

        entry.updatedAt = new Date().toISOString();
        tasks[idx] = entry;
        await saveTasks(tasksFile, tasks);
        return `Updated task ${input.taskId}.\n${formatTask(entry)}`;
      } catch (error: unknown) {
        const msg = extractErrorMessage(error);
        return `Error [task-update]: ${msg}`;
      }
    },
  });
}

export const taskUpdate = createTaskUpdate();
