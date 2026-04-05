import { describe, it, expect, vi } from 'vitest';
import {
  createContextCompaction,
  contextCompaction,
} from '../../src/context-compaction/index.js';

const execOpts = { toolCallId: 'test', messages: [] };

describe('createContextCompaction', () => {
  it('returns messages unchanged when within token budget', async () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];
    const tool = createContextCompaction({ maxTokens: 4096 });

    const result = await tool.execute({ messages }, execOpts);
    const parsed = JSON.parse(result);

    expect(parsed.compacted).toBe(false);
    expect(parsed.messages).toEqual(messages);
    expect(parsed.reason).toBe('Already within token budget');
  });

  it('compacts messages over budget with summarize function', async () => {
    const longContent = 'x'.repeat(20000);
    const messages = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
    ];
    const summarize = vi
      .fn()
      .mockResolvedValue('Summary of conversation');
    const tool = createContextCompaction({
      summarize,
      maxTokens: 4096,
    });

    const result = await tool.execute({ messages }, execOpts);
    const parsed = JSON.parse(result);

    expect(parsed.compacted).toBe(true);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].role).toBe('system');
    expect(parsed.messages[0].content).toBe('Summary of conversation');
    expect(parsed.originalCount).toBe(2);
    expect(summarize).toHaveBeenCalledWith(messages);
  });

  it('returns error string when no summarize function is configured', async () => {
    const longContent = 'x'.repeat(20000);
    const messages = [{ role: 'user', content: longContent }];
    const tool = createContextCompaction({ maxTokens: 1000 });

    const result = await tool.execute({ messages }, execOpts);

    expect(result).toContain('Error [context-compaction]');
    expect(result).toContain('No summarize function configured');
  });

  it('returns error string when summarize throws', async () => {
    const longContent = 'x'.repeat(20000);
    const messages = [{ role: 'user', content: longContent }];
    const summarize = vi
      .fn()
      .mockRejectedValue(new Error('LLM timeout'));
    const tool = createContextCompaction({
      summarize,
      maxTokens: 1000,
    });

    const result = await tool.execute({ messages }, execOpts);

    expect(result).toContain('Error [context-compaction]');
    expect(result).toContain('Summarization failed');
    expect(result).toContain('LLM timeout');
  });

  it('uses custom maxTokens from execute parameter', async () => {
    // With default 4096, 100 chars is within budget (4096*4 = 16384).
    // With maxTokens=10, 100 chars exceeds budget (10*4 = 40).
    const messages = [{ role: 'user', content: 'a'.repeat(100) }];
    const summarize = vi.fn().mockResolvedValue('Short');
    const tool = createContextCompaction({ summarize });

    const withinBudget = await tool.execute({ messages }, execOpts);
    expect(JSON.parse(withinBudget).compacted).toBe(false);

    const overBudget = await tool.execute(
      { messages, maxTokens: 10 },
      execOpts,
    );
    expect(JSON.parse(overBudget).compacted).toBe(true);
    expect(JSON.parse(overBudget).messages[0].content).toBe('Short');
  });

  it('handles non-Error thrown values from summarize', async () => {
    const longContent = 'x'.repeat(20000);
    const messages = [{ role: 'user', content: longContent }];
    const summarize = vi.fn().mockRejectedValue('raw failure');
    const tool = createContextCompaction({
      summarize,
      maxTokens: 1000,
    });

    const result = await tool.execute({ messages }, execOpts);

    expect(result).toContain('Error [context-compaction]');
    expect(result).toContain('raw failure');
  });
});

describe('contextCompaction default export', () => {
  it('is a tool object with an execute function', () => {
    expect(contextCompaction).toBeDefined();
    expect(typeof contextCompaction.execute).toBe('function');
  });

  it('returns error when messages exceed budget since no summarize is configured', async () => {
    const longContent = 'x'.repeat(20000);
    const messages = [{ role: 'user', content: longContent }];

    const result = await contextCompaction.execute(
      { messages },
      execOpts,
    );

    expect(result).toContain('Error [context-compaction]');
    expect(result).toContain('No summarize function configured');
  });
});
