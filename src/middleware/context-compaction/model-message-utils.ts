import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
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

// ── Token estimation ───────────────────────────────────────────────

const PLACEHOLDER_IMAGE_CHARS = 1000;
const PLACEHOLDER_FILE_CHARS = 200;
const PLACEHOLDER_APPROVAL_CHARS = 80;

/**
 * Estimate the token count of a ModelMessage[] using the chars / 4
 * heuristic. Multimodal parts contribute a fixed placeholder cost.
 */
export function estimateModelMessageTokens(
  messages: ModelMessage[],
): number {
  let chars = 0;
  for (const msg of messages) {
    chars += messageCharCount(msg);
  }
  return Math.ceil(chars / 4);
}

function messageCharCount(msg: ModelMessage): number {
  if (msg.role === 'system') {
    return msg.content.length;
  }
  if (typeof msg.content === 'string') {
    return msg.content.length;
  }
  let chars = 0;
  for (const part of msg.content as AnyContentPart[]) {
    chars += partCharCount(part);
  }
  return chars;
}

function partCharCount(part: AnyContentPart): number {
  switch (part.type) {
    case 'text':
      return part.text.length;
    case 'reasoning':
      return part.text.length;
    case 'image':
      return PLACEHOLDER_IMAGE_CHARS;
    case 'file':
      return PLACEHOLDER_FILE_CHARS;
    case 'tool-call':
      return part.toolName.length + safeJsonLength(part.input);
    case 'tool-result':
      return part.toolName.length + toolResultLength(part.output);
    case 'tool-approval-request':
    case 'tool-approval-response':
      return PLACEHOLDER_APPROVAL_CHARS;
    default:
      return PLACEHOLDER_APPROVAL_CHARS;
  }
}

function safeJsonLength(value: unknown): number {
  try {
    return JSON.stringify(value ?? '').length;
  } catch {
    return 50;
  }
}

function toolResultLength(output: unknown): number {
  if (output == null || typeof output !== 'object') return 50;
  const o = output as { type?: string; value?: unknown; reason?: string };
  switch (o.type) {
    case 'text':
      return String(o.value ?? '').length;
    case 'json':
      return safeJsonLength(o.value);
    case 'execution-denied':
      return String(o.reason ?? '').length + 30;
    case 'error-text':
      return String(o.value ?? '').length + 20;
    case 'error-json':
      return safeJsonLength(o.value) + 20;
    case 'content':
      return safeJsonLength(o.value);
    default:
      return 50;
  }
}

// ── Prompt splitting ───────────────────────────────────────────────

export interface SplitResult {
  systemPrefix: ModelMessage[];
  olderHistory: ModelMessage[];
  recentWindow: ModelMessage[];
}

/**
 * Split messages into:
 *   - leading contiguous system prefix
 *   - older history (to be summarized)
 *   - recent window (kept verbatim)
 *
 * The recent window starts as the last `keepRecentMessages` messages
 * (excluding the system prefix), then extends backwards to preserve
 * tool-call / tool-result / tool-approval pairs. A pair is preserved
 * when any toolCallId or approvalId in the recent window is also
 * referenced in older history — the older message is pulled into the
 * recent window. Iterates until the boundary stabilizes.
 *
 * Mid-conversation system messages (i.e. system messages not in the
 * leading prefix) are NOT hoisted — they remain in whichever side
 * (older / recent) they fall into.
 */
export function splitModelMessages(
  messages: ModelMessage[],
  keepRecentMessages: number,
): SplitResult {
  let systemPrefixEnd = 0;
  while (
    systemPrefixEnd < messages.length &&
    messages[systemPrefixEnd]!.role === 'system'
  ) {
    systemPrefixEnd++;
  }
  const systemPrefix = messages.slice(0, systemPrefixEnd);
  const nonSystem = messages.slice(systemPrefixEnd);

  if (nonSystem.length <= keepRecentMessages) {
    return { systemPrefix, olderHistory: [], recentWindow: nonSystem };
  }

  let boundary = nonSystem.length - keepRecentMessages;

  // Iterative ID-tracking: extend boundary backwards until no older
  // message references an ID present in the recent window.
  let extended = true;
  let safetyIterations = nonSystem.length + 1;
  while (extended && safetyIterations-- > 0) {
    extended = false;
    const keptIds = new Set<string>();
    for (let i = boundary; i < nonSystem.length; i++) {
      collectIds(nonSystem[i]!, keptIds);
    }
    if (keptIds.size === 0) break;

    for (let i = 0; i < boundary; i++) {
      if (messageReferencesAny(nonSystem[i]!, keptIds)) {
        boundary = i;
        extended = true;
        break;
      }
    }
  }

  return {
    systemPrefix,
    olderHistory: nonSystem.slice(0, boundary),
    recentWindow: nonSystem.slice(boundary),
  };
}

function collectIds(msg: ModelMessage, ids: Set<string>): void {
  if (msg.role === 'system' || msg.role === 'user') return;
  if (typeof msg.content === 'string') return;
  for (const part of msg.content as AnyContentPart[]) {
    addPartIds(part, ids);
  }
}

function messageReferencesAny(
  msg: ModelMessage,
  ids: Set<string>,
): boolean {
  if (msg.role === 'system' || msg.role === 'user') return false;
  if (typeof msg.content === 'string') return false;
  for (const part of msg.content as AnyContentPart[]) {
    if (partReferencesAny(part, ids)) return true;
  }
  return false;
}

function addPartIds(part: AnyContentPart, ids: Set<string>): void {
  if (part.type === 'tool-call' || part.type === 'tool-result') {
    ids.add(part.toolCallId);
  } else if (
    part.type === 'tool-approval-request' ||
    part.type === 'tool-approval-response'
  ) {
    ids.add(part.approvalId);
  }
}

function partReferencesAny(
  part: AnyContentPart,
  ids: Set<string>,
): boolean {
  if (part.type === 'tool-call' || part.type === 'tool-result') {
    return ids.has(part.toolCallId);
  }
  if (
    part.type === 'tool-approval-request' ||
    part.type === 'tool-approval-response'
  ) {
    return ids.has(part.approvalId);
  }
  return false;
}

// ── Summary extraction ─────────────────────────────────────────────

/**
 * Extract plain text from a doGenerate result's content array.
 * Returns null if no text content was produced.
 */
export function extractSummaryText(
  result: LanguageModelV3GenerateResult,
): string | null {
  const text = result.content
    .filter(
      (c): c is { type: 'text'; text: string } => c.type === 'text',
    )
    .map((c) => c.text)
    .join('\n')
    .trim();
  return text || null;
}
