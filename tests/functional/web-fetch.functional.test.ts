import { describe, it, expect } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { webFetch } from '../../src/web-fetch/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: web-fetch tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model fetches a URL and gets content back', async () => {
    const { steps } = await generateText({
      model,
      tools: { web_fetch: webFetch },
      prompt: 'Fetch the URL https://httpbin.org/get',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results.length).toBeGreaterThan(10);
  });

  it('model gets error for unreachable URL', async () => {
    const { steps } = await generateText({
      model,
      tools: { web_fetch: webFetch },
      prompt: 'Fetch the URL https://this-domain-does-not-exist-xyz-999.com',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toMatch(/Error|error|failed|ENOTFOUND/i);
  });
});
