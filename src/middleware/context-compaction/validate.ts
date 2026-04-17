import type { CompactMessagesOptions } from './compact-messages.js';

const DEFAULT_RESERVED_OUTPUT = 16384;
const DEFAULT_THRESHOLD_PCT = 0.8;

/**
 * Validate `compactMessages` options. Throws a clear error for any
 * misconfiguration. Order matters: required-shape errors first, then
 * cross-field constraints, then summarizer presence.
 */
export function validateConfig(options: CompactMessagesOptions): void {
  if (
    typeof options.maxContextTokens !== 'number' ||
    options.maxContextTokens <= 0
  ) {
    throw new Error(
      '[compactMessages] maxContextTokens must be a positive number',
    );
  }

  const reservedOutputTokens =
    options.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT;
  if (reservedOutputTokens < 0) {
    throw new Error(
      '[compactMessages] reservedOutputTokens must be non-negative',
    );
  }
  if (reservedOutputTokens >= options.maxContextTokens) {
    throw new Error(
      `[compactMessages] reservedOutputTokens (${reservedOutputTokens}) must be less than maxContextTokens (${options.maxContextTokens})`,
    );
  }

  const thresholdPct =
    options.autoCompactThresholdPct ?? DEFAULT_THRESHOLD_PCT;
  if (thresholdPct <= 0 || thresholdPct > 1) {
    throw new Error(
      '[compactMessages] autoCompactThresholdPct must be in (0, 1]',
    );
  }

  if (options.summaryTargetTokens !== undefined) {
    if (
      options.summaryTargetTokens <= 0 ||
      options.summaryTargetTokens >= options.maxContextTokens
    ) {
      throw new Error(
        '[compactMessages] summaryTargetTokens must be > 0 and < maxContextTokens',
      );
    }
  }

  if (options.keepRecentMessages !== undefined) {
    if (
      !Number.isInteger(options.keepRecentMessages) ||
      options.keepRecentMessages < 1
    ) {
      throw new Error(
        '[compactMessages] keepRecentMessages must be a positive integer',
      );
    }
  }

  const hasSummarize = typeof options.summarize === 'function';
  const hasSummaryModel = options.summaryModel != null;
  if (hasSummarize && hasSummaryModel) {
    throw new Error(
      '[compactMessages] Pass exactly one of `summaryModel` or `summarize`, not both',
    );
  }
  if (!hasSummarize && !hasSummaryModel) {
    throw new Error(
      '[compactMessages] Either `summaryModel` or `summarize` must be provided',
    );
  }
}
