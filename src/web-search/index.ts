import { tool } from 'ai';
import { z } from 'zod';

export interface WebSearchConfig {
  /** Callback to perform the actual search. Users provide their own implementation. */
  onSearch?: (
    query: string,
    opts: { allowed_domains?: string[]; blocked_domains?: string[] },
  ) => Promise<string>;
}

export function createWebSearch(config: WebSearchConfig = {}) {
  return tool({
    description:
      'Search the web for information using a search query. ' +
      'Results can be filtered by allowed or blocked domains.',
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
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [web-search]: ${msg}`;
      }
    },
  });
}

export const webSearch = createWebSearch();
