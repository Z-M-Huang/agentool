import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';

/**
 * Configuration for the context compaction tool.
 * Extends {@link BaseToolConfig} with summarization options.
 *
 * @example
 * ```typescript
 * import { createContextCompaction } from 'agentool/context-compaction';
 *
 * const compactor = createContextCompaction({
 *   summarize: async (msgs) => `Summary of ${msgs.length} messages`,
 *   maxTokens: 2048,
 * });
 * ```
 */
export interface ContextCompactionConfig extends BaseToolConfig {
  /**
   * Function that summarizes messages into a shorter form.
   * Consumer must provide this for compaction to work.
   */
  summarize?: (
    messages: Array<{ role: string; content: string }>,
  ) => Promise<string>;
  /** Maximum tokens target. Defaults to 4096. */
  maxTokens?: number;
}

/** Zod schema for context compaction parameters. */
const parametersSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z
          .string()
          .describe('Message role (system, user, assistant)'),
        content: z.string().describe('Message content'),
      }),
    )
    .describe('The conversation messages to compact'),
  maxTokens: z
    .number()
    .optional()
    .describe(
      'Target maximum tokens (default: config.maxTokens or 4096)',
    ),
});

/**
 * Create a context compaction tool with the given configuration.
 * Summarizes conversation history to reduce context size when it
 * exceeds the token budget (estimated as maxTokens * 4 characters).
 *
 * @param config - Configuration including the summarize callback and token budget
 * @returns An AI SDK tool that compacts conversation messages
 *
 * @example
 * ```typescript
 * import { createContextCompaction } from 'agentool/context-compaction';
 *
 * const compactor = createContextCompaction({
 *   summarize: async (msgs) => {
 *     // Call your LLM to summarize
 *     return 'Condensed summary of the conversation';
 *   },
 *   maxTokens: 4096,
 * });
 * ```
 */
export function createContextCompaction(
  config: ContextCompactionConfig = {},
) {
  return tool({
    description:
      'Compact conversation history by summarizing older messages to reduce ' +
      'context size. Requires a summarize function in config. Returns compacted ' +
      'messages where total chars < maxTokens * 4.',
    inputSchema: zodSchema(parametersSchema),
    execute: async ({
      messages,
      maxTokens: inputMaxTokens,
    }) => {
      const maxTokens = inputMaxTokens ?? config.maxTokens ?? 4096;
      const charBudget = maxTokens * 4;

      // Check if already within budget
      const totalChars = messages.reduce(
        (sum, m) => sum + m.content.length,
        0,
      );
      if (totalChars <= charBudget) {
        return JSON.stringify({
          compacted: false,
          messages,
          reason: 'Already within token budget',
        });
      }

      // Need summarization function
      if (!config.summarize) {
        return (
          'Error [context-compaction]: No summarize function configured. ' +
          'Provide a summarize callback in the tool config.'
        );
      }

      try {
        const summary = await config.summarize(messages);
        const compactedMessages = [{ role: 'system', content: summary }];
        return JSON.stringify({
          compacted: true,
          messages: compactedMessages,
          originalCount: messages.length,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        return `Error [context-compaction]: Summarization failed: ${msg}`;
      }
    },
  });
}

/**
 * Default context compaction tool instance with no summarize function.
 * Configure with {@link createContextCompaction} for full functionality.
 *
 * @example
 * ```typescript
 * import { contextCompaction } from 'agentool/context-compaction';
 * // Use directly — will return error if messages exceed budget
 * // since no summarize function is configured.
 * ```
 */
export const contextCompaction = createContextCompaction();
