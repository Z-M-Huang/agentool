import { describe, it, expect, vi } from 'vitest';
import { createAskUser, askUser } from '../../src/ask-user/index.js';

describe('createAskUser', () => {
  it('invokes onQuestion callback and returns the response', async () => {
    const onQuestion = vi.fn().mockResolvedValue('Yes, proceed');
    const tool = createAskUser({ onQuestion });

    const result = await tool.execute(
      { question: 'Should I continue?' },
      { toolCallId: 'test-1', messages: [] },
    );

    expect(onQuestion).toHaveBeenCalledWith('Should I continue?', undefined);
    expect(result).toBe('Yes, proceed');
  });

  it('passes options array to the onQuestion callback', async () => {
    const onQuestion = vi.fn().mockResolvedValue('Option B');
    const tool = createAskUser({ onQuestion });

    const result = await tool.execute(
      { question: 'Pick one', options: ['Option A', 'Option B', 'Option C'] },
      { toolCallId: 'test-2', messages: [] },
    );

    expect(onQuestion).toHaveBeenCalledWith('Pick one', [
      'Option A',
      'Option B',
      'Option C',
    ]);
    expect(result).toBe('Option B');
  });

  it('returns error string when no onQuestion callback is configured', async () => {
    const tool = createAskUser();

    const result = await tool.execute(
      { question: 'Hello?' },
      { toolCallId: 'test-3', messages: [] },
    );

    expect(result).toContain('Error [ask-user]');
    expect(result).toContain('No onQuestion callback configured');
  });

  it('returns error string when onQuestion callback throws', async () => {
    const onQuestion = vi
      .fn()
      .mockRejectedValue(new Error('Connection lost'));
    const tool = createAskUser({ onQuestion });

    const result = await tool.execute(
      { question: 'Are you there?' },
      { toolCallId: 'test-4', messages: [] },
    );

    expect(result).toContain('Error [ask-user]');
    expect(result).toContain('Connection lost');
  });

  it('handles non-Error thrown values in callback', async () => {
    const onQuestion = vi.fn().mockRejectedValue('raw string error');
    const tool = createAskUser({ onQuestion });

    const result = await tool.execute(
      { question: 'Test?' },
      { toolCallId: 'test-5', messages: [] },
    );

    expect(result).toContain('Error [ask-user]');
    expect(result).toContain('raw string error');
  });
});

describe('askUser default export', () => {
  it('is a tool object with an execute function', () => {
    expect(askUser).toBeDefined();
    expect(typeof askUser.execute).toBe('function');
  });

  it('returns error string since no callback is configured', async () => {
    const result = await askUser.execute(
      { question: 'default test' },
      { toolCallId: 'test-6', messages: [] },
    );

    expect(result).toContain('Error [ask-user]');
    expect(result).toContain('No onQuestion callback configured');
  });
});
