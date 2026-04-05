import { describe, it, expect } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createWebSearch } from '../../src/web-search/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: web-search tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model searches the web using callback and gets results', async () => {
    const tool = createWebSearch({
      onSearch: async (query, { allowed_domains }) => {
        return [
          `Result for "${query}":`,
          '1. TypeScript Handbook - https://typescriptlang.org/docs',
          '2. TypeScript Deep Dive - https://basarat.gitbook.io',
          allowed_domains?.length ? `Filtered to: ${allowed_domains.join(', ')}` : '',
        ].filter(Boolean).join('\n');
      },
    });
    const { steps } = await generateText({
      model,
      tools: { web_search: tool },
      prompt: 'Search the web for "TypeScript generics tutorial"',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('TypeScript');
  });

  it('model gets error when no search callback configured', async () => {
    const tool = createWebSearch();
    const { steps } = await generateText({
      model,
      tools: { web_search: tool },
      prompt: 'Search the web for "test query"',
      maxSteps: 3,
    });
    const results = collectToolResults(steps);
    expect(results).toContain('Error [web-search]');
  });
});
