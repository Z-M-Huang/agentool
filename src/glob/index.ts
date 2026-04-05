import { tool } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';
import { expandPath } from '../shared/path.js';
import { glob as sharedGlob } from '../shared/glob.js';
import { getPrompt } from './prompt.js';

export { getPrompt as globPrompt } from './prompt.js';

/**
 * Creates a glob tool that finds files matching a pattern.
 *
 * Uses ripgrep `--files --glob` under the hood for fast file matching.
 * Returns absolute paths sorted by modification time (newest first).
 * Execute never throws; errors are returned as descriptive strings.
 *
 * @param config - Optional configuration with a custom working directory.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createGlob } from 'agentool/glob';
 *
 * const globTool = createGlob({ cwd: '/my/project' });
 * const result = await globTool.execute(
 *   { pattern: '**\/*.ts' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createGlob(config: GlobConfig = {}) {
  const cwd = config.cwd ?? process.cwd();

  return tool({
    description: config.description ?? getPrompt(),
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern to match files against'),
      path: z
        .string()
        .optional()
        .describe('Directory to search in. Defaults to the working directory.'),
    }),
    execute: async ({ pattern, path }) => {
      try {
        const searchDir = path ? expandPath(path, cwd) : cwd;
        const { files, truncated } = await sharedGlob(pattern, searchDir);

        if (files.length === 0) {
          return 'No files found';
        }

        const header = truncated
          ? `Found ${files.length}+ files (results truncated)`
          : `Found ${files.length} files`;

        return `${header}\n${files.join('\n')}`;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return `Error [glob]: Failed to search for files: ${message}`;
      }
    },
  });
}

/**
 * Default glob tool instance using the current working directory.
 *
 * @example
 * ```typescript
 * import { glob } from 'agentool/glob';
 * const result = await glob.execute(
 *   { pattern: '**\/*.ts' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export type GlobConfig = BaseToolConfig & {
  /** Override the default tool description. */
  description?: string;
};

export const glob = createGlob();
