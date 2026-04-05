import { tool } from 'ai';
import { z } from 'zod';

export interface ToolSearchConfig {
  /** Registry of available tools to search through. */
  tools?: Record<string, { description: string }>;
}

export function createToolSearch(config: ToolSearchConfig = {}) {
  return tool({
    description:
      'Search for available tools by name or keyword. ' +
      'Returns matching tool names and descriptions.',
    inputSchema: z.object({
      query: z.string().describe('Query to find tools by name or keyword'),
      max_results: z
        .number()
        .optional()
        .default(5)
        .describe('Max results to return'),
    }),
    execute: async ({ query, max_results }) => {
      try {
        const registry = config.tools ?? {};
        const entries = Object.entries(registry);
        if (entries.length === 0) {
          return 'No tools registered. Provide a tools registry via createToolSearch({ tools: { ... } })';
        }

        const lower = query.toLowerCase();
        const scored = entries
          .map(([name, { description }]) => {
            let score = 0;
            const nameLower = name.toLowerCase();
            const descLower = description.toLowerCase();
            if (nameLower === lower) score += 10;
            else if (nameLower.includes(lower)) score += 5;
            if (descLower.includes(lower)) score += 3;
            // Score individual query words
            for (const word of lower.split(/\s+/)) {
              if (nameLower.includes(word)) score += 2;
              if (descLower.includes(word)) score += 1;
            }
            return { name, description, score };
          })
          .filter((e) => e.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, max_results);

        if (scored.length === 0) {
          return `No tools matched query "${query}".`;
        }

        return scored
          .map((e) => `${e.name}: ${e.description}`)
          .join('\n');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [tool-search]: ${msg}`;
      }
    },
  });
}

export const toolSearch = createToolSearch();
