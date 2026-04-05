import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTaskCreate } from '../../src/task-create/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: task-create tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'func-task-create-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('model creates a task with subject and description', async () => {
    const tool = createTaskCreate({ tasksFile: join(dir, 'tasks.json') });
    const { steps } = await generateText({
      model,
      tools: { task_create: tool },
      prompt: 'Create a task with subject "Fix login bug" and description "Auth token expires too soon"',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('Created task');
    expect(results).toContain('Fix login bug');
  });
});
