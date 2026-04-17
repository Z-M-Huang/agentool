import { describe, expect, it } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { ModelMessage } from 'ai';

import { compactMessages } from '../../src/middleware/context-compaction/compact-messages.js';
import { hasApiConfig } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: compactMessages', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('compacts a 3-turn conversation and the result is consumable by generateText', async () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'You are a helpful assistant. Reply briefly.' },
      ...Array.from({ length: 5 }, (_, i): ModelMessage[] => [
        {
          role: 'user',
          content: `Question ${i + 1}: tell me a fact about the number ${i + 1}. ${'x'.repeat(200)}`,
        },
        {
          role: 'assistant',
          content: `Number ${i + 1} fact: ${'y'.repeat(200)}`,
        },
      ]).flat(),
      { role: 'user', content: 'What is 2 + 2?' },
    ];

    const compacted = await compactMessages({
      messages,
      summaryModel: model,
      maxContextTokens: 500,
      autoCompactThresholdPct: 0.1,
      reservedOutputTokens: 0,
      summaryTargetTokens: 100,
    });

    // Compaction should have happened
    expect(compacted).not.toBe(messages);
    expect(compacted.length).toBeLessThan(messages.length);

    // The compacted result must be valid for generateText
    const { text } = await generateText({
      model,
      messages: compacted,
    });

    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  }, 60_000);

  it('a no-op compaction returns the same reference (cheap path)', async () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hi' },
    ];
    const result = await compactMessages({
      messages,
      summaryModel: model,
      maxContextTokens: 200_000,
    });
    expect(result).toBe(messages);
  });
});
