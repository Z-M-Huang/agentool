import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEdit } from '../../src/edit/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

let fixtureDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `agentool-func-edit-${Date.now()}`);
  mkdirSync(fixtureDir, { recursive: true });
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe.skipIf(!hasApiConfig)('functional: edit tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model replaces a string in a file', async () => {
    const filePath = join(fixtureDir, 'config.ts');
    writeFileSync(filePath, 'const PORT = 3000;\nconst HOST = "localhost";\n');

    const editTool = createEdit({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { edit: editTool },
      prompt: `In the file ${filePath}, replace "const PORT = 3000;" with "const PORT = 8080;"`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results.length).toBeGreaterThan(0);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('8080');
    expect(content).not.toContain('3000');
  });

  it('model gets error when old_string not found', async () => {
    const filePath = join(fixtureDir, 'static.txt');
    writeFileSync(filePath, 'unchanged content\n');

    const editTool = createEdit({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { edit: editTool },
      prompt: `In the file ${filePath}, replace "this does not exist" with "replacement"`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toMatch(/not found|Error/i);
  });
});
