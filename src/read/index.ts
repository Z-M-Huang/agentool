import { tool } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';
import { expandPath } from '../shared/path.js';
import { addLineNumbers, readFileInRange } from '../shared/file.js';

/**
 * Configuration for the read tool.
 * Extends {@link BaseToolConfig} with an optional maximum line count.
 *
 * @example
 * ```typescript
 * import type { ReadConfig } from 'agentool/read';
 * const config: ReadConfig = { cwd: '/my/project', maxLines: 500 };
 * ```
 */
export interface ReadConfig extends BaseToolConfig {
  /**
   * Maximum number of lines to return when no explicit limit is given.
   * @default 2000
   */
  maxLines?: number;
}

/**
 * Creates a read tool that reads file contents with line numbers.
 *
 * The tool resolves the given path (supporting `~` and relative paths),
 * reads the requested range of lines, and returns the content with
 * `cat -n` style line numbers. It never throws; errors are returned as
 * descriptive strings.
 *
 * @param config - Optional configuration for cwd and max lines.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createRead } from 'agentool/read';
 *
 * const readTool = createRead({ cwd: '/my/project' });
 * const result = await readTool.execute(
 *   { file_path: 'src/index.ts' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createRead(config: ReadConfig = {}) {
  const cwd = config.cwd ?? process.cwd();
  const defaultMaxLines = config.maxLines ?? 2000;

  return tool({
    description:
      'Read a file from the local filesystem and return its contents with line numbers. ' +
      'Supports absolute paths, relative paths (resolved against the working directory), ' +
      'and tilde (~) home directory expansion. ' +
      'Returns numbered lines in "lineNumber\\tcontent" format. ' +
      'Use offset and limit to read specific ranges of large files.',
    inputSchema: z.object({
      file_path: z
        .string()
        .describe('The absolute path to the file to read'),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('The line number to start reading from (default: 0)'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('The number of lines to read (default: 2000)'),
    }),
    execute: async ({ file_path, offset, limit }) => {
      try {
        const absolutePath = expandPath(file_path, cwd);
        const result = await readFileInRange(
          absolutePath,
          offset ?? 0,
          limit ?? defaultMaxLines,
        );
        const numbered = addLineNumbers({
          content: result.content,
          startLine: (offset ?? 0) + 1,
        });
        return numbered;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [read]: ${msg}`;
      }
    },
  });
}

/**
 * Default read tool instance using the current working directory
 * and a 2000-line default limit.
 *
 * @example
 * ```typescript
 * import { read } from 'agentool/read';
 * const result = await read.execute(
 *   { file_path: '/tmp/file.txt' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export const read = createRead();
