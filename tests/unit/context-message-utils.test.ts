import { describe, expect, it } from 'vitest';
import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import {
  estimateModelMessageTokens,
  extractSummaryText,
  splitModelMessages,
} from '../../src/middleware/context-compaction/model-message-utils.js';

describe('context message utilities', () => {
  it('estimates token counts for every supported content part shape', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const messages = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'plain user' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'text part' },
          { type: 'image', image: new URL('https://example.com/a.png') },
          {
            type: 'file',
            data: new URL('https://example.com/a.txt'),
            mediaType: 'text/plain',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'reasoning part' },
          {
            type: 'tool-call',
            toolName: 'badInput',
            toolCallId: 'tc0',
            input: circular,
          },
          {
            type: 'tool-result',
            toolName: 'nullOutput',
            toolCallId: 'tc1',
            output: null,
          },
          {
            type: 'tool-result',
            toolName: 'textOutput',
            toolCallId: 'tc2',
            output: { type: 'text' },
          },
          {
            type: 'tool-result',
            toolName: 'jsonOutput',
            toolCallId: 'tc3',
            output: { type: 'json', value: circular },
          },
          {
            type: 'tool-result',
            toolName: 'deniedOutput',
            toolCallId: 'tc4',
            output: { type: 'execution-denied' },
          },
          {
            type: 'tool-result',
            toolName: 'errorTextOutput',
            toolCallId: 'tc5',
            output: { type: 'error-text' },
          },
          {
            type: 'tool-result',
            toolName: 'errorJsonOutput',
            toolCallId: 'tc6',
            output: { type: 'error-json', value: { code: 1 } },
          },
          {
            type: 'tool-result',
            toolName: 'contentOutput',
            toolCallId: 'tc7',
            output: { type: 'content', value: [{ type: 'text', text: 'rich' }] },
          },
          {
            type: 'tool-result',
            toolName: 'unknownOutput',
            toolCallId: 'tc8',
            output: { type: 'other' },
          },
          { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'tc9' },
          { type: 'tool-approval-response', approvalId: 'a1', approved: true },
          { type: 'unknown-part' },
        ],
      },
    ] as unknown as ModelMessage[];

    expect(estimateModelMessageTokens(messages)).toBeGreaterThan(0);
  });

  it('splits short histories without creating older history', () => {
    const system: ModelMessage = { role: 'system', content: 'sys' };
    const user: ModelMessage = { role: 'user', content: 'latest' };

    expect(splitModelMessages([system, user], 2)).toEqual({
      systemPrefix: [system],
      olderHistory: [],
      recentWindow: [user],
    });
  });

  it('does not treat assistant string content as a tool reference', () => {
    const olderAssistant: ModelMessage = {
      role: 'assistant',
      content: 'plain assistant text',
    };
    const recentTool: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolName: 'read',
          toolCallId: 'tc1',
          output: { type: 'text', value: 'ok' },
        },
      ],
    };

    expect(splitModelMessages([olderAssistant, recentTool], 1)).toEqual({
      systemPrefix: [],
      olderHistory: [olderAssistant],
      recentWindow: [recentTool],
    });
  });

  it('does not treat ordinary assistant parts as tool references', () => {
    const olderAssistant = {
      role: 'assistant',
      content: [{ type: 'text', text: 'not a tool reference' }],
    } as ModelMessage;
    const recentTool: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolName: 'read',
          toolCallId: 'tc1',
          output: { type: 'text', value: 'ok' },
        },
      ],
    };

    expect(splitModelMessages([olderAssistant, recentTool], 1)).toEqual({
      systemPrefix: [],
      olderHistory: [olderAssistant],
      recentWindow: [recentTool],
    });
  });


  it('extends the recent window for approval id references', () => {
    const request: ModelMessage = {
      role: 'assistant',
      content: [
        {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'tc1',
        },
      ],
    };
    const response: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      ],
    };

    expect(splitModelMessages([request, response], 1)).toEqual({
      systemPrefix: [],
      olderHistory: [],
      recentWindow: [request, response],
    });
  });

  it('extracts summary text and ignores non-text model output', () => {
    const withText = {
      content: [
        { type: 'reasoning', text: 'hidden' },
        { type: 'text', text: ' first ' },
        { type: 'text', text: 'second' },
      ],
    } as unknown as LanguageModelV3GenerateResult;
    const withoutText = {
      content: [{ type: 'reasoning', text: 'hidden' }],
    } as unknown as LanguageModelV3GenerateResult;

    expect(extractSummaryText(withText)).toBe('first \nsecond');
    expect(extractSummaryText(withoutText)).toBeNull();
  });
});
