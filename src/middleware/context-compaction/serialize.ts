import type {
  FilePart,
  ImagePart,
  ModelMessage,
  ReasoningPart,
  TextPart,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolCallPart,
  ToolResultPart,
} from '@ai-sdk/provider-utils';

type AnyContentPart =
  | TextPart
  | ImagePart
  | FilePart
  | ReasoningPart
  | ToolCallPart
  | ToolResultPart
  | ToolApprovalRequest
  | ToolApprovalResponse;

/**
 * Serialize ModelMessage[] into a human-readable string for the
 * summarizer prompt.
 */
export function serializeModelMessages(messages: ModelMessage[]): string {
  return messages.map(serializeMessage).join('\n\n');
}

function serializeMessage(msg: ModelMessage): string {
  const label = msg.role.toUpperCase();
  if (msg.role === 'system') {
    return `[${label}]\n${msg.content}`;
  }
  if (typeof msg.content === 'string') {
    return `[${label}]\n${msg.content}`;
  }
  const parts: string[] = [];
  for (const part of msg.content as AnyContentPart[]) {
    const s = serializePart(part);
    if (s) parts.push(s);
  }
  return `[${label}]\n${parts.join('\n')}`;
}

function serializePart(part: AnyContentPart): string {
  switch (part.type) {
    case 'text':
      return part.text;
    case 'reasoning':
      return `[reasoning: ${part.text}]`;
    case 'image':
      return '[image]';
    case 'file': {
      const fp = part as FilePart & { filename?: string };
      const name = fp.filename ? `: ${fp.filename}` : '';
      return `[file${name}]`;
    }
    case 'tool-call':
      return `[tool-call: ${part.toolName}(${safeJsonString(part.input)})]`;
    case 'tool-result':
      return `[tool-result: ${part.toolName} → ${serializeToolOutput(part.output)}]`;
    case 'tool-approval-request':
      return `[tool-approval-request: id=${part.approvalId}]`;
    case 'tool-approval-response':
      return `[tool-approval-response: id=${part.approvalId} approved=${part.approved}]`;
    default:
      return '';
  }
}

function safeJsonString(value: unknown): string {
  try {
    return JSON.stringify(value ?? '');
  } catch {
    return '"[unserializable]"';
  }
}

function serializeToolOutput(output: unknown): string {
  if (output == null || typeof output !== 'object') return '';
  const o = output as { type?: string; value?: unknown; reason?: string };
  switch (o.type) {
    case 'text':
      return String(o.value ?? '');
    case 'json':
      return safeJsonString(o.value);
    case 'execution-denied':
      return `denied: ${String(o.reason ?? '')}`;
    case 'error-text':
      return `error: ${String(o.value ?? '')}`;
    case 'error-json':
      return `error: ${safeJsonString(o.value)}`;
    case 'content':
      return safeJsonString(o.value);
    default:
      return '';
  }
}
