import type {
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';

/**
 * Estimate the token count of a prompt using the chars / 4 heuristic.
 */
export function estimateTokens(prompt: LanguageModelV3Prompt): number {
  let chars = 0;
  for (const msg of prompt) {
    chars += messageCharCount(msg);
  }
  return Math.ceil(chars / 4);
}

function messageCharCount(msg: LanguageModelV3Message): number {
  if (msg.role === 'system') {
    return msg.content.length;
  }
  let chars = 0;
  for (const part of msg.content) {
    switch (part.type) {
      case 'text':
        chars += part.text.length;
        break;
      case 'reasoning':
        chars += part.text.length;
        break;
      case 'tool-call':
        chars +=
          part.toolName.length + JSON.stringify(part.input).length;
        break;
      case 'tool-result':
        chars += part.toolName.length + toolResultLength(part.output);
        break;
      case 'file':
        // Files are opaque binary — count a placeholder's worth
        chars += 20;
        break;
      default:
        // tool-approval-response and future types: small fixed estimate
        chars += 20;
        break;
    }
  }
  return chars;
}

function toolResultLength(
  output: { type: string; value?: unknown; reason?: string },
): number {
  if (output.type === 'text') return String(output.value ?? '').length;
  if (output.type === 'json')
    return JSON.stringify(output.value ?? '').length;
  if (output.type === 'execution-denied')
    return (output.reason ?? '').length + 20;
  return 20;
}

// ── Serialization ──────────────────────────────────────────────────

/**
 * Convert prompt messages to a human-readable string for the summarizer.
 */
export function serializePrompt(
  messages: LanguageModelV3Message[],
): string {
  return messages.map(serializeMessage).join('\n\n');
}

function serializeMessage(msg: LanguageModelV3Message): string {
  const label = msg.role.toUpperCase();
  if (msg.role === 'system') {
    return `[${label}]\n${msg.content}`;
  }
  const parts: string[] = [];
  for (const part of msg.content) {
    const s = serializePart(part);
    if (s) parts.push(s);
  }
  return `[${label}]\n${parts.join('\n')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializePart(part: any): string {
  switch (part.type) {
    case 'text':
      return part.text;
    case 'reasoning':
      return `[reasoning: ${part.text}]`;
    case 'file':
      return `[file${part.filename ? `: ${part.filename}` : ''}]`;
    case 'tool-call':
      return `[tool-call: ${part.toolName}(${JSON.stringify(part.input)})]`;
    case 'tool-result':
      return `[tool-result: ${part.toolName} → ${serializeToolOutput(part.output)}]`;
    case 'tool-approval-response':
      return `[tool-approval: ${part.approved ? 'approved' : 'denied'}]`;
    default:
      return '';
  }
}

function serializeToolOutput(
  output: { type: string; value?: unknown; reason?: string },
): string {
  if (output.type === 'text') return String(output.value ?? '');
  if (output.type === 'json') return JSON.stringify(output.value ?? '');
  if (output.type === 'execution-denied')
    return `denied: ${output.reason ?? ''}`;
  return '';
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

// ── Prompt splitting ───────────────────────────────────────────────

export interface SplitResult {
  systemMessages: LanguageModelV3Message[];
  olderHistory: LanguageModelV3Message[];
  recentWindow: LanguageModelV3Message[];
}

/**
 * Split a prompt into system messages, older history (to summarize),
 * and a recent window (to keep verbatim).
 *
 * The recent window is built by walking backwards and accumulating
 * messages until the token budget is reached, ensuring tool-call /
 * tool-result pairs are never split.
 */
export function splitPrompt(
  prompt: LanguageModelV3Prompt,
  recentTokenBudget: number,
  tokenEstimator: (prompt: LanguageModelV3Prompt) => number,
): SplitResult {
  const systemMessages: LanguageModelV3Message[] = [];
  const nonSystem: LanguageModelV3Message[] = [];

  for (const msg of prompt) {
    if (msg.role === 'system') {
      systemMessages.push(msg);
    } else {
      nonSystem.push(msg);
    }
  }

  // Walk backwards from end to build recent window
  let recentTokens = 0;
  let splitIndex = nonSystem.length; // default: no recent window

  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const msgTokens = tokenEstimator([nonSystem[i]!]);
    if (recentTokens + msgTokens > recentTokenBudget && i < nonSystem.length - 1) {
      // Would exceed budget — stop here (but always keep at least the last message)
      splitIndex = i + 1;
      break;
    }
    recentTokens += msgTokens;
    if (i === 0) {
      // Reached the start — everything is recent
      splitIndex = 0;
    }
  }

  // Ensure we don't split a tool-result from its preceding tool-call.
  // If the first message in recentWindow is a 'tool' message, pull the
  // preceding assistant message (which contains the tool-call) into the window.
  while (
    splitIndex > 0 &&
    nonSystem[splitIndex]?.role === 'tool'
  ) {
    splitIndex--;
  }

  return {
    systemMessages,
    olderHistory: nonSystem.slice(0, splitIndex),
    recentWindow: nonSystem.slice(splitIndex),
  };
}
