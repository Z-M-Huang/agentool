import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGrep } from '../../src/grep/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

let fixtureDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `agentool-func-grep-${Date.now()}`);
  mkdirSync(join(fixtureDir, 'src'), { recursive: true });
  writeFileSync(
    join(fixtureDir, 'src', 'app.ts'),
    'function hello() {\n  console.log("hello world");\n}\n',
  );
  writeFileSync(
    join(fixtureDir, 'src', 'utils.ts'),
    'export function add(a: number, b: number) {\n  return a + b;\n}\n',
  );
  writeFileSync(
    join(fixtureDir, 'notes.txt'),
    'TODO: fix the bug\nDone: deploy v1\nTODO: write docs\n',
  );
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe.skipIf(!hasApiConfig)('functional: grep tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model searches for a pattern and finds matching files', async () => {
    const grepTool = createGrep({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { grep: grepTool },
      prompt: `Search for the word "function" in all files under ${fixtureDir}. Use files_with_matches output mode.`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('app.ts');
    expect(results).toContain('utils.ts');
  });

  it('model counts occurrences of a pattern', async () => {
    const grepTool = createGrep({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { grep: grepTool },
      prompt: `Count how many times "TODO" appears in files under ${fixtureDir}. Use count output mode.`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toMatch(/2/);
  });

  it('model searches with content mode and gets matching lines', async () => {
    const grepTool = createGrep({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { grep: grepTool },
      prompt: `Search for "console.log" in ${fixtureDir} using content output mode.`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('console.log');
  });
});
