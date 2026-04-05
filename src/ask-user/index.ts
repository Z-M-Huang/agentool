import { tool } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';

/**
 * Configuration for the ask-user tool.
 * Extends {@link BaseToolConfig} with an optional callback for receiving user input.
 *
 * @example
 * ```typescript
 * import type { AskUserConfig } from 'agentool/ask-user';
 * const config: AskUserConfig = {
 *   onQuestion: async (question) => prompt(question) ?? '',
 * };
 * ```
 */
export interface AskUserConfig extends BaseToolConfig {
  /**
   * Callback invoked when the tool needs user input.
   * Must be provided for the tool to work.
   *
   * @param question - The question to present to the user
   * @param options - Optional list of suggested response options
   * @returns The user's response string
   */
  onQuestion?: (question: string, options?: string[]) => Promise<string>;
}

/**
 * Creates an ask-user tool instance with the given configuration.
 * The tool pauses agent execution and prompts the user for input via the
 * configured {@link AskUserConfig.onQuestion} callback.
 *
 * Execute never throws. Errors are returned as descriptive strings.
 *
 * @param config - Tool configuration with optional onQuestion callback
 * @returns An AI SDK tool that asks the user a question and returns their response
 *
 * @example
 * ```typescript
 * import { createAskUser } from 'agentool/ask-user';
 * const askUser = createAskUser({
 *   onQuestion: async (q, opts) => {
 *     console.log(q, opts);
 *     return 'user reply';
 *   },
 * });
 * ```
 */
export function createAskUser(config: AskUserConfig = {}) {
  return tool({
    description:
      'Ask the user a question and wait for their response. ' +
      'Use this when you need clarification, confirmation, or additional ' +
      'information from the user before proceeding.',
    inputSchema: z.object({
      question: z.string().describe('The question to ask the user'),
      options: z
        .array(z.string())
        .optional()
        .describe('Optional list of suggested response options'),
    }),
    execute: async ({ question, options }) => {
      if (!config.onQuestion) {
        return (
          'Error [ask-user]: No onQuestion callback configured. ' +
          'Provide an onQuestion function in the tool config to enable user interaction.'
        );
      }
      try {
        const response = await config.onQuestion(question, options);
        return response;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [ask-user]: Failed to get user response: ${msg}`;
      }
    },
  });
}

/**
 * Default ask-user tool instance with no callback configured.
 * Calling execute on this instance returns an error string prompting the
 * consumer to provide an {@link AskUserConfig.onQuestion} callback.
 *
 * @example
 * ```typescript
 * import { askUser } from 'agentool/ask-user';
 * // Typically you'd use createAskUser() with a callback instead.
 * ```
 */
export const askUser = createAskUser();
