import { tool } from 'ai';
import { z } from 'zod';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { BaseToolConfig } from '../shared/types.js';

/**
 * Configuration for the task tool.
 * Extends {@link BaseToolConfig} with an optional tasks file path.
 *
 * @example
 * ```typescript
 * import type { TaskConfig } from 'agentool/task';
 * const config: TaskConfig = { cwd: '/my/project' };
 * ```
 */
export interface TaskConfig extends BaseToolConfig {
  /** Path to the tasks JSON file. Defaults to `<cwd>/.agentool/tasks.json`. */
  tasksFile?: string;
}

interface Task {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

function generateId(): string {
  return randomBytes(4).toString('hex');
}

async function loadTasks(filePath: string): Promise<Task[]> {
  try {
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as Task[];
  } catch {
    return [];
  }
}

async function saveTasks(filePath: string, tasks: Task[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(tasks, null, 2), 'utf-8');
}

function formatTask(t: Task): string {
  return [
    `ID: ${t.id}`,
    `Subject: ${t.subject}`,
    `Description: ${t.description}`,
    `Status: ${t.status}`,
    `Created: ${t.createdAt}`,
    `Updated: ${t.updatedAt}`,
  ].join('\n');
}

/**
 * Creates a task tool that provides JSON file-based task tracking.
 *
 * Tasks are stored in a single JSON file with CRUD operations.
 * Each task has an id, subject, description, status, and timestamps.
 * Execute never throws; errors are returned as descriptive strings.
 *
 * @param config - Optional configuration for cwd and tasks file path.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createTask } from 'agentool/task';
 *
 * const taskTool = createTask({ cwd: '/my/project' });
 * const result = await taskTool.execute(
 *   { action: 'create', subject: 'Fix bug', description: 'Fix the login bug' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createTask(config: TaskConfig = {}) {
  const cwd = config.cwd ?? process.cwd();
  const tasksFile = config.tasksFile ?? join(cwd, '.agentool', 'tasks.json');

  return tool({
    description:
      'JSON file-based task tracker. ' +
      'Use this to create, get, update, list, and delete tasks. ' +
      'Each task has an id, subject, description, status, and timestamps.',
    inputSchema: z.object({
      action: z.enum(['create', 'get', 'update', 'list', 'delete']).describe(
        'The operation to perform',
      ),
      id: z.string().optional().describe(
        'Task id (required for get, update, delete)',
      ),
      subject: z.string().optional().describe(
        'Task subject (required for create, optional for update)',
      ),
      description: z.string().optional().describe(
        'Task description (required for create, optional for update)',
      ),
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe(
        'Task status (optional for create/update, defaults to pending)',
      ),
    }),
    execute: async ({ action, id, subject, description, status }) => {
      try {
        switch (action) {
          case 'create':
            return await createEntry(tasksFile, subject, description, status);
          case 'list':
            return await listEntries(tasksFile);
          case 'get':
            return await getEntry(tasksFile, id);
          case 'update':
            return await updateEntry(tasksFile, id, subject, description, status);
          case 'delete':
            return await deleteEntry(tasksFile, id);
          default:
            return `Error [task]: Unknown action "${String(action)}".`;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [task]: ${msg}`;
      }
    },
  });
}

async function createEntry(
  filePath: string,
  subject: string | undefined,
  description: string | undefined,
  status: 'pending' | 'in_progress' | 'completed' | undefined,
): Promise<string> {
  if (!subject) return 'Error [task]: Subject is required for create action.';
  if (!description) return 'Error [task]: Description is required for create action.';

  const tasks = await loadTasks(filePath);
  const now = new Date().toISOString();
  const entry: Task = {
    id: generateId(),
    subject,
    description,
    status: status ?? 'pending',
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(entry);
  await saveTasks(filePath, tasks);
  return `Created task ${entry.id}.\n${formatTask(entry)}`;
}

async function listEntries(filePath: string): Promise<string> {
  const tasks = await loadTasks(filePath);
  if (tasks.length === 0) return 'No tasks found.';
  return tasks.map(formatTask).join('\n---\n');
}

async function getEntry(filePath: string, id: string | undefined): Promise<string> {
  if (!id) return 'Error [task]: ID is required for get action.';
  const tasks = await loadTasks(filePath);
  const found = tasks.find(t => t.id === id);
  if (!found) return `Error [task]: Task "${id}" not found.`;
  return formatTask(found);
}

async function updateEntry(
  filePath: string,
  id: string | undefined,
  subject: string | undefined,
  description: string | undefined,
  status: 'pending' | 'in_progress' | 'completed' | undefined,
): Promise<string> {
  if (!id) return 'Error [task]: ID is required for update action.';
  const tasks = await loadTasks(filePath);
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return `Error [task]: Task "${id}" not found.`;

  const entry = tasks[idx];
  if (subject) entry.subject = subject;
  if (description) entry.description = description;
  if (status) entry.status = status;
  entry.updatedAt = new Date().toISOString();
  tasks[idx] = entry;
  await saveTasks(filePath, tasks);
  return `Updated task ${id}.\n${formatTask(entry)}`;
}

async function deleteEntry(filePath: string, id: string | undefined): Promise<string> {
  if (!id) return 'Error [task]: ID is required for delete action.';
  const tasks = await loadTasks(filePath);
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return `Error [task]: Task "${id}" not found.`;
  tasks.splice(idx, 1);
  await saveTasks(filePath, tasks);
  return `Deleted task "${id}".`;
}

/**
 * Default task tool instance using `.agentool/tasks.json` under the current
 * working directory.
 *
 * @example
 * ```typescript
 * import { task } from 'agentool/task';
 * const result = await task.execute(
 *   { action: 'list' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export const task = createTask();
