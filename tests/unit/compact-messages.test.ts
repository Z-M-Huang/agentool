import { describe, expect, it, vi } from 'vitest';
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';

import { compactMessages } from '../../src/middleware/context-compaction/compact-messages.js';

// ── Helpers ────────────────────────────────────────────────────────

function userMsg(text: string): ModelMessage {
  return { role: 'user', content: text };
}

function asstMsg(text: string): ModelMessage {
  return { role: 'assistant', content: text };
}

function sysMsg(text: string): ModelMessage {
  return { role: 'system', content: text };
}

function asstWithToolCall(
  toolName: string,
  toolCallId: string,
  input: unknown = {},
): ModelMessage {
  return {
    role: 'assistant',
    content: [{ type: 'tool-call', toolName, toolCallId, input }],
  };
}

function toolResult(
  toolName: string,
  toolCallId: string,
  text = 'ok',
): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolName,
        toolCallId,
        output: { type: 'text', value: text },
      },
    ],
  };
}

function asstWithApprovalReq(
  toolName: string,
  toolCallId: string,
  approvalId: string,
): ModelMessage {
  return {
    role: 'assistant',
    content: [
      { type: 'tool-call', toolName, toolCallId, input: {} },
      { type: 'tool-approval-request', approvalId, toolCallId },
    ],
  };
}

function toolApprovalResponse(approvalId: string): ModelMessage {
  return {
    role: 'tool',
    content: [
      { type: 'tool-approval-response', approvalId, approved: true },
    ],
  };
}

function bigMsg(role: 'user' | 'assistant', size = 5000): ModelMessage {
  return { role, content: 'x'.repeat(size) };
}

/** Mirrors `convertToLanguageModelPrompt`'s validation rule. */
function assertNoOrphanToolCalls(messages: ModelMessage[]): void {
  const open = new Set<string>();
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p.type === 'tool-call' && !p.providerExecuted) {
          open.add(p.toolCallId);
        }
      }
    } else if (m.role === 'tool') {
      for (const p of m.content) {
        if (p.type === 'tool-result') open.delete(p.toolCallId);
      }
    } else if ((m.role === 'user' || m.role === 'system') && open.size > 0) {
      throw new Error(`orphan tool calls before ${m.role}: ${[...open].join(',')}`);
    }
  }
  if (open.size > 0) {
    throw new Error(`unmatched tool calls at end: ${[...open].join(',')}`);
  }
}

const SUMMARY = 'previous conversation summarized';

const fakeSummarize = vi.fn(async () => SUMMARY);

function freshSummarizer(text: string = SUMMARY) {
  return vi.fn(async () => text);
}

// ── Tests ──────────────────────────────────────────────────────────

describe('compactMessages — no-op cases', () => {
  it('returns same reference when under threshold', async () => {
    const messages: ModelMessage[] = [userMsg('hi'), asstMsg('hello')];
    const result = await compactMessages({
      messages,
      maxContextTokens: 10_000,
      reservedOutputTokens: 0,
      summarize: freshSummarizer(),
    });
    expect(result).toBe(messages);
  });

  it('returns same reference when only system + last message exists', async () => {
    const summarize = freshSummarizer();
    const messages: ModelMessage[] = [
      sysMsg('you are helpful'),
      bigMsg('user', 4000),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      summarize,
    });
    expect(result).toBe(messages);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('returns same reference when keepRecentMessages exceeds non-system messages', async () => {
    const summarize = freshSummarizer();
    const messages: ModelMessage[] = [
      sysMsg('sys'),
      bigMsg('user', 4000),
      bigMsg('assistant', 4000),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      keepRecentMessages: 10,
      summarize,
    });
    expect(result).toBe(messages);
    expect(summarize).not.toHaveBeenCalled();
  });
});

describe('compactMessages — re-compaction proof', () => {
  it('does not re-summarize when called again on already-compacted output', async () => {
    const summarize = freshSummarizer();
    const messages: ModelMessage[] = [
      sysMsg('sys'),
      ...Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0 ? bigMsg('user', 1000) : bigMsg('assistant', 1000),
      ),
    ];
    const compacted = await compactMessages({
      messages,
      maxContextTokens: 5_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.5,
      summarize,
    });
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(compacted).not.toBe(messages);

    // Second call on the result — should be under threshold and skip
    const second = await compactMessages({
      messages: compacted,
      maxContextTokens: 5_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.5,
      summarize,
    });
    expect(second).toBe(compacted);
    expect(summarize).toHaveBeenCalledTimes(1);
  });
});

describe('compactMessages — output shape', () => {
  it('produces [system…, user(summary), assistant(Understood.), …recent]', async () => {
    const messages: ModelMessage[] = [
      sysMsg('sys-A'),
      sysMsg('sys-B'),
      bigMsg('user', 2000),
      bigMsg('assistant', 2000),
      bigMsg('user', 2000),
      userMsg('latest'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      keepRecentMessages: 1,
      summarize: freshSummarizer('SUMMARY-TEXT'),
    });

    expect(result).not.toBe(messages);
    expect(result[0]).toEqual(sysMsg('sys-A'));
    expect(result[1]).toEqual(sysMsg('sys-B'));
    expect(result[2]).toEqual({ role: 'user', content: 'SUMMARY-TEXT' });
    expect(result[3]).toEqual({ role: 'assistant', content: 'Understood.' });
    expect(result[4]).toEqual(userMsg('latest'));
  });

  it('preserves leading system prefix verbatim (by reference per element)', async () => {
    const sys1 = sysMsg('sys1');
    const sys2 = sysMsg('sys2');
    const messages: ModelMessage[] = [
      sys1,
      sys2,
      bigMsg('user', 2000),
      bigMsg('assistant', 2000),
      userMsg('latest'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      summarize: freshSummarizer(),
    });
    expect(result[0]).toBe(sys1);
    expect(result[1]).toBe(sys2);
  });

  it('does NOT hoist mid-conversation system messages to the front', async () => {
    const midSys = sysMsg('mid-system-instruction');
    const messages: ModelMessage[] = [
      sysMsg('leading-sys'),
      bigMsg('user', 2000),
      bigMsg('assistant', 2000),
      midSys,
      userMsg('latest'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      keepRecentMessages: 2,
      summarize: freshSummarizer(),
    });
    // Leading system + summary + Understood + (midSys, user('latest'))
    expect(result[0]).toEqual(sysMsg('leading-sys'));
    expect(result[1]).toEqual({ role: 'user', content: SUMMARY });
    expect(result[2]).toEqual({ role: 'assistant', content: 'Understood.' });
    // midSys stays in place — NOT promoted to a leading system message
    const sysCount = result.filter((m) => m.role === 'system').length;
    expect(sysCount).toBe(2);
    expect(result.at(-2)).toBe(midSys);
  });
});

describe('compactMessages — tool-chain integrity', () => {
  it('keeps tool-call + matching tool-result together', async () => {
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      asstWithToolCall('search', 'tc1'),
      toolResult('search', 'tc1'),
      userMsg('continue'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 2_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      keepRecentMessages: 2, // would split asst↔tool — must be extended
      summarize: freshSummarizer(),
    });
    // Expect summary then [asst-call, tool-result, user('continue')]
    const tail = result.slice(-3);
    expect(tail[0]?.role).toBe('assistant');
    expect(tail[1]?.role).toBe('tool');
    expect(tail[2]).toEqual(userMsg('continue'));
    assertNoOrphanToolCalls(result);
  });

  it('handles a single assistant with multiple parallel tool-calls', async () => {
    const asst: ModelMessage = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolName: 't', toolCallId: 'a', input: {} },
        { type: 'tool-call', toolName: 't', toolCallId: 'b', input: {} },
      ],
    };
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      asst,
      toolResult('t', 'a'),
      toolResult('t', 'b'),
      userMsg('continue'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 2_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      keepRecentMessages: 1, // would isolate user('continue'); must extend back
      summarize: freshSummarizer(),
    });
    assertNoOrphanToolCalls(result);
  });

  it('preserves tool-approval-request + response chains', async () => {
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      asstWithApprovalReq('exec', 'tc1', 'app1'),
      toolApprovalResponse('app1'),
      toolResult('exec', 'tc1'),
      userMsg('done?'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 2_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      keepRecentMessages: 2,
      summarize: freshSummarizer(),
    });
    assertNoOrphanToolCalls(result);
    // The approval request, response, result, and final user must all
    // be in the recent window (id chains drag everything together)
    const recentRoles = result.slice(2).map((m) => m.role);
    expect(recentRoles).toContain('assistant');
    expect(recentRoles.filter((r) => r === 'tool').length).toBeGreaterThanOrEqual(2);
  });

  it('handles assistant message containing a tool-result part (legal under AssistantContent)', async () => {
    const asstWithResultPart: ModelMessage = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolName: 'x', toolCallId: 'tc1', input: {} },
        {
          type: 'tool-result',
          toolName: 'x',
          toolCallId: 'tc1',
          output: { type: 'text', value: 'result' },
        },
      ],
    };
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      asstWithResultPart,
      userMsg('next'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 2_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      keepRecentMessages: 1,
      summarize: freshSummarizer(),
    });
    // The asstWithResultPart self-contains its tc1 pair, so once
    // pulled into the recent window or left in older history it's
    // never partially split.
    assertNoOrphanToolCalls(result);
  });

  it('compacted output passes orphan-free validation under various keep sizes', async () => {
    const base: ModelMessage[] = [
      bigMsg('user', 2000),
      asstWithToolCall('t', '1'),
      toolResult('t', '1'),
      bigMsg('user', 2000),
      asstWithToolCall('t', '2'),
      toolResult('t', '2'),
      userMsg('end'),
    ];
    for (const keep of [1, 2, 3, 4]) {
      const result = await compactMessages({
        messages: base,
        maxContextTokens: 1_500,
        reservedOutputTokens: 0,
        autoCompactThresholdPct: 0.1,
        keepRecentMessages: keep,
        summarize: freshSummarizer(),
      });
      assertNoOrphanToolCalls(result);
    }
  });
});

describe('compactMessages — summarizer failure paths', () => {
  it('passthrough when summarizer returns empty string', async () => {
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      bigMsg('assistant', 4000),
      userMsg('latest'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      summarize: freshSummarizer(''),
    });
    expect(result).toBe(messages);
  });

  it('throws when summarizer returns empty and onCompactionFailure is throw', async () => {
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      bigMsg('assistant', 4000),
      userMsg('latest'),
    ];
    await expect(
      compactMessages({
        messages,
        maxContextTokens: 1_000,
        reservedOutputTokens: 0,
        autoCompactThresholdPct: 0.1,
        onCompactionFailure: 'throw',
        summarize: freshSummarizer('   '),
      }),
    ).rejects.toThrow(/empty/i);
  });

  it('passthrough when summarizer throws', async () => {
    const summarize = vi.fn(async () => {
      throw new Error('boom');
    });
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      bigMsg('assistant', 4000),
      userMsg('latest'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      summarize,
    });
    expect(result).toBe(messages);
  });

  it('rethrows summarizer error when onCompactionFailure is throw', async () => {
    const summarize = vi.fn(async () => {
      throw new Error('boom');
    });
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      bigMsg('assistant', 4000),
      userMsg('latest'),
    ];
    await expect(
      compactMessages({
        messages,
        maxContextTokens: 1_000,
        reservedOutputTokens: 0,
        autoCompactThresholdPct: 0.1,
        onCompactionFailure: 'throw',
        summarize,
      }),
    ).rejects.toThrow(/boom/);
  });

  it('passthrough when summarizer returns oversize output', async () => {
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      bigMsg('assistant', 4000),
      userMsg('latest'),
    ];
    const oversize = 'z'.repeat(20_000); // > maxContextTokens after /4
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      summarize: freshSummarizer(oversize),
    });
    expect(result).toBe(messages);
  });
});

describe('compactMessages — config validation', () => {
  it('throws when maxContextTokens is missing or non-positive', async () => {
    await expect(
      compactMessages({
        messages: [],
        // @ts-expect-error — testing invalid input
        maxContextTokens: 0,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/maxContextTokens/);
  });

  it('throws when reservedOutputTokens >= maxContextTokens', async () => {
    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: 1000,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/reservedOutputTokens/);
  });

  it('throws when reservedOutputTokens is negative', async () => {
    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: -1,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/reservedOutputTokens/);
  });

  it('throws when autoCompactThresholdPct is outside the valid range', async () => {
    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: 0,
        autoCompactThresholdPct: 0,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/autoCompactThresholdPct/);

    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: 0,
        autoCompactThresholdPct: 1.1,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/autoCompactThresholdPct/);
  });

  it('throws when summaryTargetTokens cannot fit', async () => {
    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: 0,
        summaryTargetTokens: 1000,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/summaryTargetTokens/);
  });

  it('throws when keepRecentMessages is < 1', async () => {
    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: 0,
        keepRecentMessages: 0,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/keepRecentMessages/);
  });

  it('throws when keepRecentMessages is not an integer', async () => {
    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: 0,
        keepRecentMessages: 1.5,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/keepRecentMessages/);
  });

  it('throws when neither summaryModel nor summarize is provided', async () => {
    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: 0,
        // @ts-expect-error — testing missing required summarizer
      } as never),
    ).rejects.toThrow(/summaryModel.*summarize/);
  });

  it('throws when both summaryModel and summarize are provided', async () => {
    const stubModel = makeStubModel(() => ({
      content: [{ type: 'text', text: 's' }],
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      warnings: [],
    }));
    await expect(
      compactMessages({
        messages: [],
        maxContextTokens: 1000,
        reservedOutputTokens: 0,
        summaryModel: stubModel,
        // @ts-expect-error — testing invalid combination
        summarize: freshSummarizer(),
      } as never),
    ).rejects.toThrow(/exactly one/);
  });
});

describe('compactMessages — budget validation', () => {
  it('throws when systemPrefix + summaryTarget + recentWindow exceeds maxContextTokens', async () => {
    const messages: ModelMessage[] = [
      sysMsg('x'.repeat(8000)), // ~2000 tokens
      bigMsg('user', 8000), // ~2000 tokens
      bigMsg('assistant', 8000),
      bigMsg('user', 4000), // ~1000 tokens — kept verbatim
    ];
    await expect(
      compactMessages({
        messages,
        maxContextTokens: 2_000,
        reservedOutputTokens: 0,
        autoCompactThresholdPct: 0.1,
        keepRecentMessages: 1,
        summaryTargetTokens: 1_000,
        summarize: freshSummarizer(),
      }),
    ).rejects.toThrow(/cannot fit/);
  });
});

describe('compactMessages — summaryModel path', () => {
  it('calls summaryModel.doGenerate when summarize callback is not provided', async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const stubModel = makeStubModel((opts) => {
      calls.push(opts);
      return {
        content: [{ type: 'text', text: 'model-summary' }],
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        warnings: [],
      };
    });
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      bigMsg('assistant', 4000),
      userMsg('latest'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      summaryModel: stubModel,
    });
    expect(calls).toHaveLength(1);
    expect(result).not.toBe(messages);
    expect(result[0]).toEqual({ role: 'user', content: 'model-summary' });
    expect(result[1]).toEqual({ role: 'assistant', content: 'Understood.' });
  });

  it('passthrough when summaryModel returns no text content', async () => {
    const stubModel = makeStubModel(() => ({
      content: [],
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      warnings: [],
    }));
    const messages: ModelMessage[] = [
      bigMsg('user', 4000),
      bigMsg('assistant', 4000),
      userMsg('latest'),
    ];
    const result = await compactMessages({
      messages,
      maxContextTokens: 1_000,
      reservedOutputTokens: 0,
      autoCompactThresholdPct: 0.1,
      summaryModel: stubModel,
    });
    expect(result).toBe(messages);
  });
});

// ── Test stub model ────────────────────────────────────────────────

function makeStubModel(
  generate: (opts: LanguageModelV3CallOptions) => LanguageModelV3GenerateResult,
): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'stub',
    supportedUrls: {},
    async doGenerate(opts: LanguageModelV3CallOptions) {
      return generate(opts);
    },
    async doStream() {
      throw new Error('not implemented');
    },
  } as unknown as LanguageModelV3;
}
