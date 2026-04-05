import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTaskCreate } from '../../src/task-create/index.js';
import { createTaskGet } from '../../src/task-get/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: task-get tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  let dir: string;
  let tasksFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'func-task-get-'));
    tasksFile = join(dir, 'tasks.json');
    // Pre-create a task so the model can retrieve it
    const create = createTaskCreate({ tasksFile });
    const result = await create.execute(
      { subject: 'Deploy v2', description: 'Deploy version 2 to staging' },
      { toolCallId: 'setup', messages: [] },
    );
    // Extract the ID for the prompt
    const match = result.match(/Created task (\w+)/);
    if (match) dir = `${dir}|${match[1]}`;
  });

  afterEach(async () => {
    const base = dir.split('|')[0];
    await rm(base, { recursive: true, force: true });
  });

  it('model retrieves a task by ID', async () => {
    const [base, taskId] = dir.split('|');
    const tool = createTaskGet({ tasksFile: join(base, 'tasks.json') });
    const { steps } = await generateText({
      model,
      tools: { task_get: tool },
      prompt: `Get the task with ID "${taskId}"`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('Deploy v2');
  });
});
