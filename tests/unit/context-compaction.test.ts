import { describe, it, expect, vi } from 'vitest';
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
  LanguageModelV3Prompt,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { createContextCompaction } from '../../src/middleware/context-compaction/index.js';
import {
  estimateTokens,
  extractSummaryText,
  serializePrompt,
  splitPrompt,
} from '../../src/middleware/context-compaction/serialize.js';

// ── Mock model helper ──────────────────────────────────────────────

function createMockModel(
  generateResult?: Partial<LanguageModelV3GenerateResult>,
): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-model',
    defaultObjectGenerationMode: 'json',
    doGenerate: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Mock summary of conversation.' }],
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50 },
      warnings: [],
      ...generateResult,
    }),
    doStream: vi.fn().mockResolvedValue({
      stream: new ReadableStream(),
    }),
  } as unknown as LanguageModelV3;
}

function makePrompt(...msgs: LanguageModelV3Message[]): LanguageModelV3Prompt {
  return msgs;
}

function sysMsg(content: string): LanguageModelV3Message {
  return { role: 'system', content };
}

function userMsg(text: string): LanguageModelV3Message {
  return { role: 'user', content: [{ type: 'text', text }] };
}

function asstMsg(text: string): LanguageModelV3Message {
  return { role: 'assistant', content: [{ type: 'text', text }] };
}

function toolMsg(toolName: string, result: string): LanguageModelV3Message {
  return {
    role: 'tool',
    content: [
      { type: 'tool-result', toolCallId: 'tc1', toolName, output: { type: 'text', value: result } },
    ],
  };
}

// ── serialize.ts tests ─────────────────────────────────────────────

describe('estimateTokens', () => {
  it('estimates based on character count / 4', () => {
    const prompt = makePrompt(sysMsg('Hello world')); // 11 chars
    expect(estimateTokens(prompt)).toBe(3); // ceil(11/4)
  });

  it('handles typed parts in user messages', () => {
    const prompt = makePrompt(userMsg('a'.repeat(100)));
    expect(estimateTokens(prompt)).toBe(25); // 100/4
  });

  it('counts tool-call and tool-result parts', () => {
    const msg: LanguageModelV3Message = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: 'tc1', toolName: 'bash', input: { command: 'ls' } },
      ],
    };
    const tokens = estimateTokens([msg]);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('serializePrompt', () => {
  it('serializes system messages as plain text', () => {
    const result = serializePrompt([sysMsg('You are helpful.')]);
    expect(result).toContain('[SYSTEM]');
    expect(result).toContain('You are helpful.');
  });

  it('serializes user text parts', () => {
    const result = serializePrompt([userMsg('Hello')]);
    expect(result).toContain('[USER]');
    expect(result).toContain('Hello');
  });

  it('serializes file parts as placeholders', () => {
    const msg: LanguageModelV3Message = {
      role: 'user',
      content: [{ type: 'file', data: new Uint8Array(), mediaType: 'image/png' }],
    };
    const result = serializePrompt([msg]);
    expect(result).toContain('[file]');
  });

  it('serializes tool-call parts', () => {
    const msg: LanguageModelV3Message = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: 'tc1', toolName: 'grep', input: { pattern: 'foo' } },
      ],
    };
    const result = serializePrompt([msg]);
    expect(result).toContain('[tool-call: grep(');
    expect(result).toContain('"foo"');
  });

  it('serializes tool-result parts', () => {
    const msg: LanguageModelV3Message = {
      role: 'tool',
      content: [
        { type: 'tool-result', toolCallId: 'tc1', toolName: 'grep', output: { type: 'text', value: 'matched line' } },
      ],
    };
    const result = serializePrompt([msg]);
    expect(result).toContain('[tool-result: grep');
    expect(result).toContain('matched line');
  });
});

describe('extractSummaryText', () => {
  it('extracts text from content array', () => {
    const result = {
      content: [{ type: 'text' as const, text: 'Summary here.' }],
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 5 },
      warnings: [],
    };
    expect(extractSummaryText(result)).toBe('Summary here.');
  });

  it('joins multiple text blocks', () => {
    const result = {
      content: [
        { type: 'text' as const, text: 'Part 1.' },
        { type: 'text' as const, text: 'Part 2.' },
      ],
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 5 },
      warnings: [],
    };
    expect(extractSummaryText(result)).toBe('Part 1.\nPart 2.');
  });

  it('returns null when no text content', () => {
    const result = {
      content: [{ type: 'reasoning' as const, text: 'thinking...' }],
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 5 },
      warnings: [],
    };
    expect(extractSummaryText(result as unknown as LanguageModelV3GenerateResult)).toBeNull();
  });

  it('returns null for empty text', () => {
    const result = {
      content: [{ type: 'text' as const, text: '   ' }],
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 5 },
      warnings: [],
    };
    expect(extractSummaryText(result)).toBeNull();
  });
});

describe('splitPrompt', () => {
  it('extracts system messages', () => {
    const prompt = makePrompt(sysMsg('sys'), userMsg('hi'), asstMsg('hello'));
    const { systemMessages, olderHistory, recentWindow } = splitPrompt(prompt, 10000, estimateTokens);
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0]!.role).toBe('system');
    // With a large budget, everything fits in recent
    expect(olderHistory).toHaveLength(0);
    expect(recentWindow).toHaveLength(2);
  });

  it('splits older history from recent window', () => {
    const longText = 'x'.repeat(4000);
    const prompt = makePrompt(
      sysMsg('sys'),
      userMsg(longText), asstMsg(longText),
      userMsg(longText), asstMsg(longText),
      userMsg('recent'), asstMsg('response'),
    );
    // Small budget = only recent messages kept
    const { systemMessages, olderHistory, recentWindow } = splitPrompt(prompt, 50, estimateTokens);
    expect(systemMessages).toHaveLength(1);
    expect(olderHistory.length).toBeGreaterThan(0);
    expect(recentWindow.length).toBeGreaterThan(0);
    // Recent window should contain the last message(s)
    const lastRecent = recentWindow[recentWindow.length - 1]!;
    expect(lastRecent.role).toBe('assistant');
  });

  it('never splits tool message from preceding assistant', () => {
    const prompt = makePrompt(
      userMsg('first'),
      asstMsg('response with tool call'),
      toolMsg('bash', 'output'),
      userMsg('recent'),
    );
    // Budget only fits the last user message
    const { recentWindow } = splitPrompt(prompt, 20, estimateTokens);
    // Should NOT start with a tool message
    if (recentWindow.length > 0) {
      expect(recentWindow[0]!.role).not.toBe('tool');
    }
  });

  it('handles prompt with no system messages', () => {
    const prompt = makePrompt(userMsg('hello'), asstMsg('hi'));
    const { systemMessages } = splitPrompt(prompt, 10000, estimateTokens);
    expect(systemMessages).toHaveLength(0);
  });
});

// ── createContextCompaction middleware tests ────────────────────────

describe('createContextCompaction', () => {
  it('throws if maxContextTokens is missing or invalid', () => {
    expect(() => createContextCompaction({ maxContextTokens: 0 })).toThrow('maxContextTokens');
    expect(() => createContextCompaction({ maxContextTokens: -1 })).toThrow('maxContextTokens');
  });

  it('returns middleware with specificationVersion v3', () => {
    const mw = createContextCompaction({ maxContextTokens: 200000 });
    expect(mw.specificationVersion).toBe('v3');
    expect(mw.wrapGenerate).toBeDefined();
    expect(mw.wrapStream).toBeDefined();
  });
});

describe('wrapGenerate', () => {
  it('passes through when under threshold', async () => {
    const mw = createContextCompaction({ maxContextTokens: 200000 });
    const model = createMockModel();
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'response' }],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5 },
      warnings: [],
    });

    const params = {
      prompt: makePrompt(sysMsg('sys'), userMsg('short question')),
    } as LanguageModelV3CallOptions;

    await mw.wrapGenerate!({ doGenerate, doStream: vi.fn(), params, model });

    // doGenerate called (passthrough), model.doGenerate NOT called
    expect(doGenerate).toHaveBeenCalled();
    expect(model.doGenerate).not.toHaveBeenCalled();
  });

  it('compacts when over threshold and preserves system messages', async () => {
    const mw = createContextCompaction({
      maxContextTokens: 200, // very small
      autoCompactThresholdPct: 0.1,
      summaryTargetPct: 0.5,
      reservedOutputTokens: 0,
    });
    const model = createMockModel();
    const doGenerate = vi.fn();

    const longText = 'x'.repeat(2000);
    const params = {
      prompt: makePrompt(
        sysMsg('You are helpful.'),
        userMsg(longText), asstMsg(longText),
        userMsg(longText), asstMsg(longText),
        userMsg('latest question'),
      ),
    } as LanguageModelV3CallOptions;

    await mw.wrapGenerate!({ doGenerate, doStream: vi.fn(), params, model });

    // doGenerate NOT called (compaction happened), model.doGenerate called twice
    expect(doGenerate).not.toHaveBeenCalled();
    expect(model.doGenerate).toHaveBeenCalledTimes(2);

    // First call: summarization (no tools)
    const summaryCallParams = (model.doGenerate as ReturnType<typeof vi.fn>).mock.calls[0]![0] as LanguageModelV3CallOptions;
    expect(summaryCallParams.tools).toBeUndefined();
    expect(summaryCallParams.toolChoice).toBeUndefined();

    // Second call: the actual request with compacted prompt
    const finalCallParams = (model.doGenerate as ReturnType<typeof vi.fn>).mock.calls[1]![0] as LanguageModelV3CallOptions;
    const finalPrompt = finalCallParams.prompt;

    // System message preserved
    expect(finalPrompt[0]!.role).toBe('system');
    expect((finalPrompt[0] as { role: 'system'; content: string }).content).toBe('You are helpful.');

    // Summary as user message
    expect(finalPrompt[1]!.role).toBe('user');

    // Assistant acknowledgment for role alternation
    expect(finalPrompt[2]!.role).toBe('assistant');
  });

  it('uses custom summarizer when provided', async () => {
    const customSummarize = vi.fn().mockResolvedValue('Custom summary');
    const mw = createContextCompaction({
      maxContextTokens: 100,
      autoCompactThresholdPct: 0.1,
      reservedOutputTokens: 0,
      summarize: customSummarize,
    });
    const model = createMockModel();
    const doGenerate = vi.fn();

    const params = {
      prompt: makePrompt(
        userMsg('x'.repeat(2000)),
        asstMsg('x'.repeat(2000)),
        userMsg('latest'),
      ),
    } as LanguageModelV3CallOptions;

    await mw.wrapGenerate!({ doGenerate, doStream: vi.fn(), params, model });

    expect(customSummarize).toHaveBeenCalled();
    // model.doGenerate called once (final call only, not for summarization)
    expect(model.doGenerate).toHaveBeenCalledTimes(1);
  });

  it('passes through on failure with onCompactionFailure=passthrough', async () => {
    const mw = createContextCompaction({
      maxContextTokens: 100,
      autoCompactThresholdPct: 0.1,
      reservedOutputTokens: 0,
      summarize: vi.fn().mockRejectedValue(new Error('LLM error')),
      onCompactionFailure: 'passthrough',
    });
    const model = createMockModel();
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5 },
      warnings: [],
    });

    const params = {
      prompt: makePrompt(userMsg('x'.repeat(2000)), asstMsg('y'.repeat(2000))),
    } as LanguageModelV3CallOptions;

    // Should not throw, should fall back to doGenerate
    await mw.wrapGenerate!({ doGenerate, doStream: vi.fn(), params, model });
    expect(doGenerate).toHaveBeenCalled();
  });

  it('throws on failure with onCompactionFailure=throw', async () => {
    const mw = createContextCompaction({
      maxContextTokens: 100,
      autoCompactThresholdPct: 0.1,
      reservedOutputTokens: 0,
      summarize: vi.fn().mockRejectedValue(new Error('LLM error')),
      onCompactionFailure: 'throw',
    });
    const model = createMockModel();

    const params = {
      prompt: makePrompt(userMsg('x'.repeat(2000)), asstMsg('y'.repeat(2000))),
    } as LanguageModelV3CallOptions;

    await expect(
      mw.wrapGenerate!({ doGenerate: vi.fn(), doStream: vi.fn(), params, model }),
    ).rejects.toThrow('LLM error');
  });

  it('uses custom estimateTokens when provided', async () => {
    const customEstimate = vi.fn().mockReturnValue(999999); // always over threshold
    const mw = createContextCompaction({
      maxContextTokens: 200000,
      estimateTokens: customEstimate,
      reservedOutputTokens: 0,
    });
    const model = createMockModel();
    const doGenerate = vi.fn();

    const params = {
      prompt: makePrompt(
        userMsg('short'),
        asstMsg('short'),
        userMsg('q'),
      ),
    } as LanguageModelV3CallOptions;

    await mw.wrapGenerate!({ doGenerate, doStream: vi.fn(), params, model });
    expect(customEstimate).toHaveBeenCalled();
    // Should have triggered compaction despite short content
    expect(model.doGenerate).toHaveBeenCalled();
  });
});

describe('wrapStream', () => {
  it('passes through when under threshold', async () => {
    const mw = createContextCompaction({ maxContextTokens: 200000 });
    const model = createMockModel();
    const doStream = vi.fn().mockResolvedValue({ stream: new ReadableStream() });

    const params = {
      prompt: makePrompt(userMsg('short')),
    } as LanguageModelV3CallOptions;

    await mw.wrapStream!({ doGenerate: vi.fn(), doStream, params, model });
    expect(doStream).toHaveBeenCalled();
    expect(model.doStream).not.toHaveBeenCalled();
  });

  it('compacts and calls model.doStream when over threshold', async () => {
    const mw = createContextCompaction({
      maxContextTokens: 100,
      autoCompactThresholdPct: 0.1,
      reservedOutputTokens: 0,
    });
    const model = createMockModel();
    (model.doStream as ReturnType<typeof vi.fn>).mockResolvedValue({ stream: new ReadableStream() });
    const doStream = vi.fn();

    const params = {
      prompt: makePrompt(
        userMsg('x'.repeat(2000)),
        asstMsg('y'.repeat(2000)),
        userMsg('latest'),
      ),
    } as LanguageModelV3CallOptions;

    await mw.wrapStream!({ doGenerate: vi.fn(), doStream, params, model });

    // doStream NOT called (compaction happened), model.doStream called
    expect(doStream).not.toHaveBeenCalled();
    expect(model.doGenerate).toHaveBeenCalledTimes(1); // summary call
    expect(model.doStream).toHaveBeenCalledTimes(1); // final call
  });
});
