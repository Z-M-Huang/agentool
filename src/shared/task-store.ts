import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  owner?: string;
  activeForm?: string;
  blocks: string[];
  blockedBy: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function generateId(): string {
  return randomBytes(4).toString('hex');
}

export async function loadTasks(filePath: string): Promise<Task[]> {
  try {
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as Task[];
  } catch {
    return [];
  }
}

export async function saveTasks(filePath: string, tasks: Task[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(tasks, null, 2), 'utf-8');
}

export function formatTask(t: Task): string {
  const lines = [
    `ID: ${t.id}`,
    `Subject: ${t.subject}`,
    `Description: ${t.description}`,
    `Status: ${t.status}`,
  ];
  if (t.owner) lines.push(`Owner: ${t.owner}`);
  if (t.activeForm) lines.push(`Active: ${t.activeForm}`);
  if (t.blocks.length > 0) lines.push(`Blocks: ${t.blocks.join(', ')}`);
  if (t.blockedBy.length > 0) lines.push(`Blocked by: ${t.blockedBy.join(', ')}`);
  if (t.metadata && Object.keys(t.metadata).length > 0) {
    lines.push(`Metadata: ${JSON.stringify(t.metadata)}`);
  }
  lines.push(`Created: ${t.createdAt}`);
  lines.push(`Updated: ${t.updatedAt}`);
  return lines.join('\n');
}

export function formatTaskSummary(t: Task): string {
  const parts = [`#${t.id} [${t.status}] ${t.subject}`];
  if (t.owner) parts.push(`(owner: ${t.owner})`);
  if (t.blockedBy.length > 0) parts.push(`[blocked by ${t.blockedBy.join(', ')}]`);
  return parts.join(' ');
}
