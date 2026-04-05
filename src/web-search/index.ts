import { tool } from 'ai';
import { z } from 'zod';
import { extractErrorMessage } from '../shared/errors.js';
import { getPrompt } from './prompt.js';

export { getPrompt as webSearchPrompt } from './prompt.js';

export interface WebSearchConfig {
  /** Callback to perform the actual search. Users provide their own implementation. */
  onSearch?: (
    query: string,
    opts: { allowed_domains?: string[]; blocked_domains?: string[] },
  ) => Promise<string>;
  /** Override the default tool description. */
  description?: string;
}

export function createWebSearch(config: WebSearchConfig = {}) {
  return tool({
    description: config.description ?? getPrompt(),
    inputSchema: z.object({
      query: z.string().min(2).describe('The search query to use'),
      allowed_domains: z
        .array(z.string())
        .optional()
        .describe('Only include search results from these domains'),
      blocked_domains: z
        .array(z.string())
        .optional()
        .describe('Never include search results from these domains'),
    }),
    execute: async ({ query, allowed_domains, blocked_domains }) => {
      try {
        if (!config.onSearch) {
          return (
            'Error [web-search]: No search callback configured. ' +
            'Provide onSearch via createWebSearch({ onSearch: async (query, opts) => ... })'
          );
        }
        return await config.onSearch(query, { allowed_domains, blocked_domains });
      } catch (error: unknown) {
        const msg = extractErrorMessage(error);
        return `Error [web-search]: ${msg}`;
      }
    },
  });
}

export const webSearch = createWebSearch();
