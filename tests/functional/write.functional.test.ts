import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWrite } from '../../src/write/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

let fixtureDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `agentool-func-write-${Date.now()}`);
  mkdirSync(fixtureDir, { recursive: true });
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe.skipIf(!hasApiConfig)('functional: write tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model creates a new file with content', async () => {
    const writeTool = createWrite({ cwd: fixtureDir });
    const filePath = join(fixtureDir, 'created.txt');
    const { steps } = await generateText({
      model,
      tools: { write: writeTool },
      prompt: `Write the text "hello from AI" to the file ${filePath}`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toMatch(/Created|wrote|written|bytes/i);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('hello from AI');
  });

  it('model creates a file in a nested directory', async () => {
    const writeTool = createWrite({ cwd: fixtureDir });
    const filePath = join(fixtureDir, 'deep', 'nested', 'dir', 'file.txt');
    const { steps } = await generateText({
      model,
      tools: { write: writeTool },
      prompt: `Write "nested content" to ${filePath}`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results.length).toBeGreaterThan(0);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('nested content');
  });
});
