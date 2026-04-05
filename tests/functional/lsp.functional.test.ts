import { describe, it, expect } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createLsp } from '../../src/lsp/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: lsp tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model gets error when no LSP servers are configured', async () => {
    const tool = createLsp();
    const { steps } = await generateText({
      model,
      tools: { lsp: tool },
      prompt: 'Use the LSP tool to hover over line 1, character 1 in the file "test.ts"',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('Error [lsp]');
    expect(results).toContain('No LSP servers configured');
  });

  it('model gets error for unconfigured file extension', async () => {
    const tool = createLsp({
      servers: { '.py': { command: 'pylsp' } },
    });
    const { steps } = await generateText({
      model,
      tools: { lsp: tool },
      prompt: 'Use the LSP tool to get the definition at line 5, character 10 in "src/index.ts"',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('Error [lsp]');
  });
});
