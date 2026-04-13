import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Middleware,
  LanguageModelV3Prompt,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';

import { buildCompactionPrompt } from './prompt.js';
import {
  estimateTokens as defaultEstimateTokens,
  extractSummaryText,
  serializePrompt,
  splitPrompt,
} from './serialize.js';

/**
 * Configuration for the context compaction middleware.
 *
 * @example
 * ```typescript
 * import { createContextCompaction } from 'agentool/context-compaction';
 * import { wrapLanguageModel } from 'ai';
 *
 * const model = wrapLanguageModel({
 *   model: anthropic('claude-sonnet-4-20250514'),
 *   middleware: createContextCompaction({
 *     maxContextTokens: 200_000,
 *   }),
 * });
 * ```
 */
export interface ContextCompactionConfig {
  /** Model's max context window in tokens. Required. */
  maxContextTokens: number;

  /**
   * Trigger compaction when estimated usage exceeds this fraction of
   * the context window (0–1). Default: `0.80`.
   */
  autoCompactThresholdPct?: number;

  /**
   * Target summary size as a fraction of `maxContextTokens` (0–1).
   * Default: `0.05`.
   */
  summaryTargetPct?: number;

  /** Tokens reserved for model output. Default: `16384`. */
  reservedOutputTokens?: number;

  /**
   * Custom token estimator. Receives the full prompt array and must
   * return an estimated token count.
   * Default: character-count / 4 heuristic.
   */
  estimateTokens?: (prompt: LanguageModelV3Prompt) => number;

  /**
   * Custom summarizer. When provided, the middleware calls this
   * instead of using the underlying model for summarization.
   */
  summarize?: (
    messages: LanguageModelV3Prompt,
    targetTokens: number,
  ) => Promise<string>;

  /**
   * What to do when summarization fails.
   * - `'passthrough'` (default): proceed with the original, uncompacted prompt.
   * - `'throw'`: throw the summarization error.
   */
  onCompactionFailure?: 'passthrough' | 'throw';
}

const DEFAULT_THRESHOLD_PCT = 0.8;
const DEFAULT_SUMMARY_TARGET_PCT = 0.05;
const DEFAULT_RESERVED_OUTPUT = 16384;
const RECENT_WINDOW_PCT = 0.2; // ~20% of context for recent turns

/**
 * Create a context-compaction middleware for the Vercel AI SDK.
 *
 * Wrap any language model with this middleware via
 * `wrapLanguageModel({ model, middleware })`. When the prompt
 * exceeds `maxContextTokens * autoCompactThresholdPct`, the
 * middleware transparently summarizes older history while
 * preserving system messages and the most recent turns.
 */
export function createContextCompaction(
  config: ContextCompactionConfig,
): LanguageModelV3Middleware {
  if (!config.maxContextTokens || config.maxContextTokens <= 0) {
    throw new Error(
      '[context-compaction] maxContextTokens must be a positive number',
    );
  }

  const thresholdPct = clamp(
    config.autoCompactThresholdPct ?? DEFAULT_THRESHOLD_PCT,
    0,
    1,
  );
  const summaryTargetPct = clamp(
    config.summaryTargetPct ?? DEFAULT_SUMMARY_TARGET_PCT,
    0,
    1,
  );
  const reservedOutput =
    config.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT;
  const tokenEstimator =
    config.estimateTokens ?? defaultEstimateTokens;
  const onFailure = config.onCompactionFailure ?? 'passthrough';

  const threshold =
    config.maxContextTokens * thresholdPct - reservedOutput;
  const summaryTargetTokens = Math.floor(
    config.maxContextTokens * summaryTargetPct,
  );
  const recentWindowBudget = Math.floor(
    config.maxContextTokens * RECENT_WINDOW_PCT,
  );

  return {
    specificationVersion: 'v3',

    wrapGenerate: async ({
      doGenerate,
      model,
      params,
    }): Promise<LanguageModelV3GenerateResult> => {
      const compacted = await compactIfNeeded(
        model,
        params,
        threshold,
        summaryTargetTokens,
        recentWindowBudget,
        tokenEstimator,
        config.summarize,
        onFailure,
      );

      if (!compacted) {
        return doGenerate();
      }

      return model.doGenerate(compacted);
    },

    wrapStream: async ({
      doStream,
      model,
      params,
    }): Promise<LanguageModelV3StreamResult> => {
      const compacted = await compactIfNeeded(
        model,
        params,
        threshold,
        summaryTargetTokens,
        recentWindowBudget,
        tokenEstimator,
        config.summarize,
        onFailure,
      );

      if (!compacted) {
        return doStream();
      }

      return model.doStream(compacted);
    },
  };
}

// ── Core compaction logic ──────────────────────────────────────────

/**
 * Check whether the prompt exceeds the threshold. If so, summarize
 * the older history and return new params. Returns `null` when no
 * compaction is needed.
 */
async function compactIfNeeded(
  model: LanguageModelV3,
  params: LanguageModelV3CallOptions,
  threshold: number,
  summaryTargetTokens: number,
  recentWindowBudget: number,
  tokenEstimator: (prompt: LanguageModelV3Prompt) => number,
  customSummarize:
    | ((
        messages: LanguageModelV3Prompt,
        targetTokens: number,
      ) => Promise<string>)
    | undefined,
  onFailure: 'passthrough' | 'throw',
): Promise<LanguageModelV3CallOptions | null> {
  const estimatedTokens = tokenEstimator(params.prompt);
  if (estimatedTokens <= threshold) {
    return null;
  }

  const { systemMessages, olderHistory, recentWindow } = splitPrompt(
    params.prompt,
    recentWindowBudget,
    tokenEstimator,
  );

  // Nothing to summarize — only system messages and/or recent turns
  if (olderHistory.length === 0) {
    return null;
  }

  let summaryText: string;

  try {
    if (customSummarize) {
      summaryText = await customSummarize(
        olderHistory,
        summaryTargetTokens,
      );
    } else {
      summaryText = await defaultSummarize(
        model,
        olderHistory,
        summaryTargetTokens,
      );
    }
  } catch (error) {
    if (onFailure === 'throw') {
      throw error;
    }
    // passthrough: proceed with original prompt
    return null;
  }

  if (!summaryText) {
    if (onFailure === 'throw') {
      throw new Error(
        '[context-compaction] Summarization produced no text output',
      );
    }
    return null;
  }

  // Build compacted prompt: system + summary(user) + ack(assistant) + recent
  const compactedPrompt: LanguageModelV3Prompt = [
    ...systemMessages,
    {
      role: 'user',
      content: [{ type: 'text', text: summaryText }],
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Understood.' }],
    },
    ...recentWindow,
  ];

  return { ...params, prompt: compactedPrompt };
}

// ── Default summarizer ─────────────────────────────────────────────

async function defaultSummarize(
  model: LanguageModelV3,
  olderHistory: LanguageModelV3Prompt,
  targetTokens: number,
): Promise<string> {
  const serialized = serializePrompt(olderHistory);
  const summaryPrompt = buildCompactionPrompt(serialized, targetTokens);

  const result = await model.doGenerate({
    prompt: summaryPrompt,
    maxOutputTokens: targetTokens,
    // Strip everything that could cause tool calls or structured output
    tools: undefined,
    toolChoice: undefined,
    responseFormat: undefined,
    inputFormat: 'messages',
    mode: { type: 'regular' },
  } as LanguageModelV3CallOptions);

  const text = extractSummaryText(result);
  if (!text) {
    throw new Error(
      '[context-compaction] Model returned no text content during summarization',
    );
  }
  return text;
}

// ── Helpers ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
