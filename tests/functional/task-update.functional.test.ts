import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTaskCreate } from '../../src/task-create/index.js';
import { createTaskUpdate } from '../../src/task-update/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: task-update tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  let dir: string;
  let taskId: string;
  let tasksFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'func-task-update-'));
    tasksFile = join(dir, 'tasks.json');
    const create = createTaskCreate({ tasksFile });
    const result = await create.execute(
      { subject: 'Review PR', description: 'Review pull request #42' },
      { toolCallId: 'setup', messages: [] },
    );
    taskId = result.match(/Created task (\w+)/)![1];
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('model updates a task status to completed', async () => {
    const tool = createTaskUpdate({ tasksFile });
    const { steps } = await generateText({
      model,
      tools: { task_update: tool },
      prompt: `Update task "${taskId}" to status "completed"`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('Updated task');
    expect(results).toContain('completed');
  });
});
