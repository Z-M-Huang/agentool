import { describe, it, expect, vi } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, wrapLanguageModel } from 'ai';
import { createContextCompaction } from '../../src/middleware/context-compaction/index.js';
import { hasApiConfig } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: context-compaction middleware', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const baseModel = provider(process.env.TEST_MODEL!);

  it('compacts long conversation and model responds coherently', async () => {
    // Use very low thresholds so compaction triggers with modest content
    const model = wrapLanguageModel({
      model: baseModel,
      middleware: createContextCompaction({
        maxContextTokens: 500,
        autoCompactThresholdPct: 0.1,
        summaryTargetPct: 0.5,
        reservedOutputTokens: 0,
      }),
    });

    // Build a prompt with enough content to exceed the threshold
    const longHistory = Array.from({ length: 5 }, (_, i) => [
      {
        role: 'user' as const,
        content: `Question ${i + 1}: ${'x'.repeat(200)}`,
      },
      {
        role: 'assistant' as const,
        content: `Answer ${i + 1}: ${'y'.repeat(200)}`,
      },
    ]).flat();

    const { text } = await generateText({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Reply briefly.' },
        ...longHistory,
        { role: 'user', content: 'What is 2 + 2?' },
      ],
      maxSteps: 1,
    });

    // The model should respond — compaction happened transparently
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  }, 60_000);

  it('calls custom summarizer when provided', async () => {
    let summarizerCalled = false;

    const model = wrapLanguageModel({
      model: baseModel,
      middleware: createContextCompaction({
        maxContextTokens: 500,
        autoCompactThresholdPct: 0.1,
        summaryTargetPct: 0.5,
        reservedOutputTokens: 0,
        summarize: async (_messages, _targetTokens) => {
          summarizerCalled = true;
          return 'The user previously asked several questions. Now they want a math answer.';
        },
      }),
    });

    const longHistory = Array.from({ length: 5 }, (_, i) => [
      {
        role: 'user' as const,
        content: `Question ${i + 1}: ${'x'.repeat(200)}`,
      },
      {
        role: 'assistant' as const,
        content: `Answer ${i + 1}: ${'y'.repeat(200)}`,
      },
    ]).flat();

    const { text } = await generateText({
      model,
      messages: [
        ...longHistory,
        { role: 'user', content: 'Say hello.' },
      ],
      maxSteps: 1,
    });

    expect(summarizerCalled).toBe(true);
    expect(text).toBeTruthy();
  }, 60_000);
});
