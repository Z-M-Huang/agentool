import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGlob } from '../../src/glob/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

let fixtureDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `agentool-func-glob-${Date.now()}`);
  mkdirSync(join(fixtureDir, 'src', 'components'), { recursive: true });
  mkdirSync(join(fixtureDir, 'tests'), { recursive: true });
  writeFileSync(join(fixtureDir, 'src', 'index.ts'), 'export {};');
  writeFileSync(join(fixtureDir, 'src', 'app.tsx'), 'export {};');
  writeFileSync(join(fixtureDir, 'src', 'components', 'Button.tsx'), 'export {};');
  writeFileSync(join(fixtureDir, 'tests', 'app.test.ts'), 'test("works", () => {});');
  writeFileSync(join(fixtureDir, 'package.json'), '{}');
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe.skipIf(!hasApiConfig)('functional: glob tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model finds TypeScript files recursively', async () => {
    const globTool = createGlob({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { glob: globTool },
      prompt: `Find all .ts and .tsx files under ${fixtureDir}`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('index.ts');
    expect(results).toContain('.tsx');
  });

  it('model finds test files by pattern', async () => {
    const globTool = createGlob({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { glob: globTool },
      prompt: `Find all files matching "**/*.test.ts" in ${fixtureDir}`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('app.test.ts');
  });

  it('model gets no results for unmatched pattern', async () => {
    const globTool = createGlob({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { glob: globTool },
      prompt: `Find all .py files under ${fixtureDir}`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toMatch(/No files found|0 files/i);
  });
});
