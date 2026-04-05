import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRead } from '../../src/read/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

let fixtureDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `agentool-func-read-${Date.now()}`);
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(
    join(fixtureDir, 'sample.txt'),
    'line one\nline two\nline three\nline four\nline five\n',
  );
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe.skipIf(!hasApiConfig)('functional: read tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model reads a file and gets line-numbered content', async () => {
    const readTool = createRead({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { read: readTool },
      prompt: `Read the file ${join(fixtureDir, 'sample.txt')}`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('line one');
    expect(results).toContain('line five');
  });

  it('model reads a partial file using offset and limit', async () => {
    const readTool = createRead({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { read: readTool },
      prompt: `Read only 2 lines from ${join(fixtureDir, 'sample.txt')} using the limit parameter set to 2.`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    // Model should have used limit=2, so we get at most 2-3 content lines (not all 5)
    const contentLines = results.split('\n').filter(l => l.includes('line'));
    expect(contentLines.length).toBeLessThanOrEqual(3);
    expect(contentLines.length).toBeGreaterThan(0);
  });

  it('model gets an error for nonexistent file', async () => {
    const readTool = createRead({ cwd: fixtureDir });
    const { steps } = await generateText({
      model,
      tools: { read: readTool },
      prompt: `Read the file ${join(fixtureDir, 'does-not-exist.txt')}`,
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toMatch(/Error|ENOENT|no such file/i);
  });
});
