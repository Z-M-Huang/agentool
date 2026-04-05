import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTaskCreate } from '../../src/task-create/index.js';
import { createTaskList } from '../../src/task-list/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: task-list tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  let dir: string;
  let tasksFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'func-task-list-'));
    tasksFile = join(dir, 'tasks.json');
    const create = createTaskCreate({ tasksFile });
    await create.execute!(
      { subject: 'Task Alpha', description: 'First task' },
      { toolCallId: 'setup1', messages: [] },
    );
    await create.execute!(
      { subject: 'Task Beta', description: 'Second task' },
      { toolCallId: 'setup2', messages: [] },
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('model lists all tasks', async () => {
    const tool = createTaskList({ tasksFile });
    const opts = {
      model,
      tools: { task_list: tool },
      prompt: 'List all tasks',
      maxSteps: 3,
    };
    const { steps } = await generateText(opts as Parameters<typeof generateText>[0]);
    const results = collectToolResults(steps);
    expect(results).toContain('Task Alpha');
    expect(results).toContain('Task Beta');
  });
});
