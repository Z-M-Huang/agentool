import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
} from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';

import { buildCompactionPrompt } from './prompt.js';
import {
  estimateModelMessageTokens,
  extractSummaryText,
  splitModelMessages,
} from './model-message-utils.js';
import { serializeModelMessages } from './serialize.js';
import { validateConfig } from './validate.js';

const DEFAULT_THRESHOLD_PCT = 0.8;
const DEFAULT_SUMMARY_TARGET_PCT = 0.05;
const DEFAULT_RESERVED_OUTPUT = 16384;
const DEFAULT_KEEP_RECENT = 1;

/**
 * Custom summarizer callback. Receives the older history slice
 * (already split off from the leading system prefix and recent
 * window) and the target summary token budget.
 */
export type CompactSummarizer = (
  olderHistory: ModelMessage[],
  targetTokens: number,
) => Promise<string>;

interface BaseCompactOptions {
  /** Conversation messages to compact. */
  messages: ModelMessage[];

  /** Model's max context window in tokens. Required. */
  maxContextTokens: number;

  /**
   * Trigger compaction when estimated usage exceeds this fraction of
   * the context window (0–1). Default: `0.8`.
   */
  autoCompactThresholdPct?: number;

  /**
   * Target summary size in tokens.
   * Default: `floor(maxContextTokens * 0.05)`.
   */
  summaryTargetTokens?: number;

  /** Tokens reserved for model output. Default: `16384`. */
  reservedOutputTokens?: number;

  /**
   * Number of trailing messages to keep verbatim. The boundary is
   * automatically extended backwards to preserve tool-call /
   * tool-result / tool-approval pairs. Default: `1`.
   */
  keepRecentMessages?: number;

  /**
   * Custom token estimator over `ModelMessage[]`. Pass a
   * provider-specific tokenizer (e.g. tiktoken) for accuracy.
   * Default: char-count / 4 heuristic.
   */
  estimateTokens?: (messages: ModelMessage[]) => number;

  /**
   * What to do when summarization fails or produces oversize output.
   * - `'passthrough'` (default): return the original `messages`.
   * - `'throw'`: throw the underlying error.
   */
  onCompactionFailure?: 'passthrough' | 'throw';
}

export type CompactMessagesOptions =
  | (BaseCompactOptions & {
      summaryModel: LanguageModelV3;
      summarize?: never;
    })
  | (BaseCompactOptions & {
      summarize: CompactSummarizer;
      summaryModel?: never;
    });

/**
 * Compact a conversation by summarizing older history while
 * preserving the leading system prefix and the most recent turns.
 *
 * Returns the **same `messages` reference** (===) when no
 * compaction is needed, so callers can use identity to detect a
 * no-op. When compaction occurs, returns a new array shaped as:
 *
 *   `[ ...systemPrefix, user(summary), assistant('Understood.'), ...recentWindow ]`
 *
 * The synthetic `user → assistant` ack pair preserves role
 * alternation, which is required by Anthropic and Google providers.
 *
 * @example
 * ```typescript
 * import { compactMessages } from 'agentool/context-compaction';
 * import { openai } from '@ai-sdk/openai';
 * import { generateText } from 'ai';
 *
 * const model = openai('gpt-5');
 * messages = await compactMessages({
 *   messages,
 *   summaryModel: openai('gpt-5-mini'),
 *   maxContextTokens: 400_000,
 * });
 * const result = await generateText({ model, messages });
 * ```
 */
export async function compactMessages(
  options: CompactMessagesOptions,
): Promise<ModelMessage[]> {
  validateConfig(options);

  const {
    messages,
    maxContextTokens,
    autoCompactThresholdPct = DEFAULT_THRESHOLD_PCT,
    reservedOutputTokens = DEFAULT_RESERVED_OUTPUT,
    keepRecentMessages = DEFAULT_KEEP_RECENT,
    estimateTokens = estimateModelMessageTokens,
    onCompactionFailure = 'passthrough',
  } = options;

  const summaryTargetTokens =
    options.summaryTargetTokens ??
    Math.floor(maxContextTokens * DEFAULT_SUMMARY_TARGET_PCT);

  const thresholdPct = clamp(autoCompactThresholdPct, 0, 1);
  const threshold = maxContextTokens * thresholdPct - reservedOutputTokens;

  const estimated = estimateTokens(messages);
  if (estimated <= threshold) {
    return messages;
  }

  const { systemPrefix, olderHistory, recentWindow } = splitModelMessages(
    messages,
    keepRecentMessages,
  );

  if (olderHistory.length === 0) {
    return messages;
  }

  // Budget coherence check: after compaction, the new prompt must
  // fit. Compute the floor: systemPrefix + summaryTarget + the
  // (already extended) recent window.
  const sysTokens = estimateTokens(systemPrefix);
  const recentTokens = estimateTokens(recentWindow);
  const projected = sysTokens + summaryTargetTokens + recentTokens;
  if (projected > maxContextTokens) {
    throw new Error(
      `[compactMessages] Configuration cannot fit: systemPrefix (${sysTokens}) + summaryTarget (${summaryTargetTokens}) + recentWindow (${recentTokens}) = ${projected} exceeds maxContextTokens (${maxContextTokens}). Reduce keepRecentMessages, lower summaryTargetTokens, or trim the system prefix.`,
    );
  }

  let summaryText: string;
  try {
    if (options.summarize) {
      summaryText = await options.summarize(olderHistory, summaryTargetTokens);
    } else {
      summaryText = await defaultSummarize(
        options.summaryModel,
        olderHistory,
        summaryTargetTokens,
      );
    }
  } catch (error) {
    if (onCompactionFailure === 'throw') throw error;
    return messages;
  }

  if (!summaryText || !summaryText.trim()) {
    if (onCompactionFailure === 'throw') {
      throw new Error(
        '[compactMessages] Summarizer produced empty output',
      );
    }
    return messages;
  }

  const compacted: ModelMessage[] = [
    ...systemPrefix,
    { role: 'user', content: summaryText },
    { role: 'assistant', content: 'Understood.' },
    ...recentWindow,
  ];

  // Re-estimate after compaction; if still over the hard ceiling
  // (maxContextTokens), the summarizer returned oversize text.
  const compactedTokens = estimateTokens(compacted);
  if (compactedTokens > maxContextTokens) {
    if (onCompactionFailure === 'throw') {
      throw new Error(
        `[compactMessages] Summarizer returned oversize output: compacted prompt is ${compactedTokens} tokens, exceeds maxContextTokens (${maxContextTokens})`,
      );
    }
    return messages;
  }

  return compacted;
}

// ── Default summarizer ─────────────────────────────────────────────

async function defaultSummarize(
  model: LanguageModelV3,
  olderHistory: ModelMessage[],
  targetTokens: number,
): Promise<string> {
  const serialized = serializeModelMessages(olderHistory);
  const summaryPrompt = buildCompactionPrompt(serialized, targetTokens);

  const result = await model.doGenerate({
    prompt: summaryPrompt,
    maxOutputTokens: targetTokens,
    tools: undefined,
    toolChoice: undefined,
    responseFormat: undefined,
    inputFormat: 'messages',
    mode: { type: 'regular' },
  } as LanguageModelV3CallOptions);

  const text = extractSummaryText(result);
  if (!text) {
    throw new Error(
      '[compactMessages] Summary model returned no text content',
    );
  }
  return text;
}

// ── Helpers ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
