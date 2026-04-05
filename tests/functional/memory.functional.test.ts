import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemory } from '../../src/memory/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

let fixtureDir: string;
let memDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `agentool-func-memory-${Date.now()}`);
  memDir = join(fixtureDir, '.agentool', 'memory');
  mkdirSync(memDir, { recursive: true });
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe.skipIf(!hasApiConfig)('functional: memory tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model writes and then reads a memory entry', async () => {
    const memoryTool = createMemory({ cwd: fixtureDir, memoryDir: memDir });

    // Write
    const writeResult = await generateText({
      model,
      tools: { memory: memoryTool },
      prompt: 'Save a memory with key "project-notes" and content "This project uses TypeScript and Vitest"',
      maxSteps: 3,
    });
    expect(collectToolResults(writeResult.steps).length).toBeGreaterThan(0);

    // Read back
    const readResult = await generateText({
      model,
      tools: { memory: memoryTool },
      prompt: 'Read the memory with key "project-notes"',
      maxSteps: 3,
    });
    const results = collectToolResults(readResult.steps);
    expect(results).toContain('TypeScript');
  });

  it('model lists memory entries', async () => {
    const memoryTool = createMemory({ cwd: fixtureDir, memoryDir: memDir });
    const { steps } = await generateText({
      model,
      tools: { memory: memoryTool },
      prompt: 'List all memory entries',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('project-notes');
  });

  it('model deletes a memory entry', async () => {
    const memoryTool = createMemory({ cwd: fixtureDir, memoryDir: memDir });
    const { steps } = await generateText({
      model,
      tools: { memory: memoryTool },
      prompt: 'Delete the memory entry with key "project-notes"',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toMatch(/Deleted|deleted|removed/i);
  });
});
