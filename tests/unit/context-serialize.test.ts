import { describe, expect, it } from 'vitest';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { compactMessages as compactMessagesFromBarrel } from '../../src/middleware/context-compaction/index.js';
import { compactMessages } from '../../src/middleware/context-compaction/compact-messages.js';
import { serializeModelMessages } from '../../src/middleware/context-compaction/serialize.js';

describe('serializeModelMessages', () => {
  it('serializes system and string content messages', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'system instructions' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];

    expect(serializeModelMessages(messages)).toBe(
      '[SYSTEM]\nsystem instructions\n\n[USER]\nhello\n\n[ASSISTANT]\nhi',
    );
  });

  it('serializes user text, image, and file parts', () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'see attached' },
          {
            type: 'image',
            image: new URL('https://example.com/image.png'),
          },
          {
            type: 'file',
            data: new URL('https://example.com/report.pdf'),
            filename: 'report.pdf',
            mediaType: 'application/pdf',
          },
          {
            type: 'file',
            data: 'plain text',
            mediaType: 'text/plain',
          },
        ],
      },
    ];

    const result = serializeModelMessages(messages);

    expect(result).toContain('see attached');
    expect(result).toContain('[image]');
    expect(result).toContain('[file: report.pdf]');
    expect(result).toContain('[file]');
  });

  it('serializes assistant reasoning, tool calls, approvals, and tool outputs', () => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'thinking' },
          {
            type: 'tool-call',
            toolName: 'read',
            toolCallId: 'tc1',
            input: { file: 'src/index.ts' },
          },
          {
            type: 'tool-result',
            toolName: 'read',
            toolCallId: 'tc1',
            output: { type: 'text', value: 'contents' },
          },
          {
            type: 'tool-result',
            toolName: 'jsonTool',
            toolCallId: 'tc2',
            output: { type: 'json', value: { ok: true } },
          },
          {
            type: 'tool-result',
            toolName: 'deniedTool',
            toolCallId: 'tc3',
            output: { type: 'execution-denied', reason: 'policy' },
          },
          {
            type: 'tool-result',
            toolName: 'errorTextTool',
            toolCallId: 'tc4',
            output: { type: 'error-text', value: 'failed' },
          },
          {
            type: 'tool-result',
            toolName: 'errorJsonTool',
            toolCallId: 'tc5',
            output: { type: 'error-json', value: { code: 500 } },
          },
          {
            type: 'tool-result',
            toolName: 'contentTool',
            toolCallId: 'tc6',
            output: { type: 'content', value: [{ type: 'text', text: 'rich' }] },
          },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-1',
            toolCallId: 'tc7',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-1',
            approved: false,
          },
          {
            type: 'tool-result',
            toolName: 'emptyTool',
            toolCallId: 'tc8',
            output: { type: 'text', value: '' },
          },
        ],
      },
    ];

    const result = serializeModelMessages(messages);

    expect(result).toContain('[reasoning: thinking]');
    expect(result).toContain('[tool-call: read({"file":"src/index.ts"})]');
    expect(result).toContain('[tool-result: read \u2192 contents]');
    expect(result).toContain('[tool-result: jsonTool \u2192 {"ok":true}]');
    expect(result).toContain('[tool-result: deniedTool \u2192 denied: policy]');
    expect(result).toContain('[tool-result: errorTextTool \u2192 error: failed]');
    expect(result).toContain('[tool-result: errorJsonTool \u2192 error: {"code":500}]');
    expect(result).toContain('[tool-result: contentTool \u2192 [{"type":"text","text":"rich"}]]');
    expect(result).toContain('[tool-approval-request: id=approval-1]');
    expect(result).toContain('[tool-approval-response: id=approval-1 approved=false]');
    expect(result).toContain('[tool-result: emptyTool \u2192 ]');
  });

  it('uses safe placeholders for unserializable or unknown part data', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolName: 'badInput',
            toolCallId: 'tc1',
            input: circular,
          },
          {
            type: 'tool-result',
            toolName: 'badOutput',
            toolCallId: 'tc2',
            output: { type: 'json', value: circular },
          },
          {
            type: 'tool-result',
            toolName: 'unknownOutput',
            toolCallId: 'tc3',
            output: { type: 'unknown' },
          },
          {
            type: 'tool-result',
            toolName: 'primitiveOutput',
            toolCallId: 'tc4',
            output: 'raw',
          },
          {
            type: 'tool-result',
            toolName: 'emptyTextOutput',
            toolCallId: 'tc5',
            output: { type: 'text' },
          },
          {
            type: 'tool-result',
            toolName: 'emptyJsonOutput',
            toolCallId: 'tc6',
            output: { type: 'json' },
          },
          {
            type: 'tool-result',
            toolName: 'emptyDeniedOutput',
            toolCallId: 'tc7',
            output: { type: 'execution-denied' },
          },
          {
            type: 'tool-result',
            toolName: 'emptyErrorTextOutput',
            toolCallId: 'tc8',
            output: { type: 'error-text' },
          },
          { type: 'unknown-part' },
        ],
      },
    ] as unknown as ModelMessage[];

    const result = serializeModelMessages(messages);

    expect(result).toContain('[tool-call: badInput("[unserializable]")]');
    expect(result).toContain('[tool-result: badOutput \u2192 "[unserializable]"]');
    expect(result).toContain('[tool-result: unknownOutput \u2192 ]');
    expect(result).toContain('[tool-result: primitiveOutput \u2192 ]');
    expect(result).toContain('[tool-result: emptyTextOutput \u2192 ]');
    expect(result).toContain('[tool-result: emptyJsonOutput \u2192 ""]');
    expect(result).toContain('[tool-result: emptyDeniedOutput \u2192 denied: ]');
    expect(result).toContain('[tool-result: emptyErrorTextOutput \u2192 error: ]');
  });

  it('keeps the context-compaction barrel export wired', () => {
    expect(compactMessagesFromBarrel).toBe(compactMessages);
  });
});
