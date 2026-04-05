import { describe, it, expect } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { bash, createBash } from '../../src/bash/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: bash tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model runs a simple echo command and output is captured', async () => {
    const { steps } = await generateText({
      model,
      tools: { bash },
      prompt: 'Run: echo "hello from agentool"',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('hello from agentool');
  });

  it('model runs a command with non-zero exit code', async () => {
    const { steps } = await generateText({
      model,
      tools: { bash },
      prompt: 'Run the shell command: exit 42',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('42');
  });

  it('model runs a command with custom cwd', async () => {
    const myBash = createBash({ cwd: '/tmp' });
    const { steps } = await generateText({
      model,
      tools: { bash: myBash },
      prompt: 'Run: pwd',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('/tmp');
  });
});
