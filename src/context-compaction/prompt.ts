import type { ContextCompactionConfig } from './index.js';

/**
 * Generate the description prompt for the context-compaction tool.
 *
 * @param config - The same config passed to {@link createContextCompaction}.
 * @returns The full description string for the context-compaction tool.
 */
export function getPrompt(
  config: Pick<ContextCompactionConfig, 'maxTokens'> = {},
): string {
  const maxTokens = config.maxTokens ?? 4096;

  return `Compact conversation history by summarizing older messages to reduce context size. Target budget: ${maxTokens} tokens.

Requires a summarize callback to be configured — the application provides the summarization implementation.

## When to Use
- When the conversation is getting long and approaching context limits
- When earlier messages contain details no longer relevant to the current task
- To free up context space for new work without losing important context

## When NOT to Use
- When the conversation is still within budget — the tool returns early if already compact
- When every message contains critical details that shouldn't be summarized
- For persisting information long-term — use the memory tool instead

## Usage Guidelines
- Messages already within the token budget (${maxTokens} tokens, ~${maxTokens * 4} characters) are returned unchanged
- The summarize callback receives all messages and should return a condensed summary
- The result replaces the original messages with a single system message containing the summary`;
}
