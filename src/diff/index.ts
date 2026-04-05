import { readFile } from 'node:fs/promises';
import { tool } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';
import { expandPath } from '../shared/path.js';
import { diffStrings, diffFiles } from '../shared/diff.js';

/**
 * Configuration for the diff tool.
 *
 * @example
 * ```typescript
 * import type { DiffConfig } from 'agentool/diff';
 * const config: DiffConfig = { cwd: '/my/project' };
 * ```
 */
export type DiffConfig = BaseToolConfig;

/**
 * Creates a diff tool that generates unified diffs between files or strings.
 *
 * Supports three modes:
 * 1. Two file paths: diffs the contents of both files.
 * 2. Two strings: diffs old_content against new_content.
 * 3. One file path + string content: reads the file and diffs against
 *    the provided content.
 *
 * Execute never throws; errors are returned as descriptive strings.
 *
 * @param config - Optional configuration for the working directory.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createDiff } from 'agentool/diff';
 *
 * const diffTool = createDiff({ cwd: '/my/project' });
 *
 * // Diff two files
 * await diffTool.execute(
 *   { file_path: 'a.txt', other_file_path: 'b.txt' },
 *   { toolCallId: 'id', messages: [] },
 * );
 *
 * // Diff two strings
 * await diffTool.execute(
 *   { old_content: 'hello\n', new_content: 'world\n' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createDiff(config: DiffConfig = {}) {
  const cwd = config.cwd ?? process.cwd();

  return tool({
    description:
      'Generate a unified diff between two files or two strings. ' +
      'Provide file_path + other_file_path to compare files, ' +
      'or old_content + new_content to compare strings. ' +
      'You can also provide file_path with old_content or new_content ' +
      'to compare a file against provided content.',
    inputSchema: z.object({
      file_path: z
        .string()
        .optional()
        .describe('Path to the first file (absolute or relative to cwd)'),
      other_file_path: z
        .string()
        .optional()
        .describe('Path to the second file (absolute or relative to cwd)'),
      old_content: z
        .string()
        .optional()
        .describe('The original content string'),
      new_content: z
        .string()
        .optional()
        .describe('The modified content string'),
    }),
    execute: async ({ file_path, other_file_path, old_content, new_content }) => {
      try {
        // Mode 1: Two file paths
        if (file_path && other_file_path) {
          const resolvedOld = expandPath(file_path, cwd);
          const resolvedNew = expandPath(other_file_path, cwd);
          return await diffFiles(resolvedOld, resolvedNew);
        }

        // Mode 2: Two content strings
        if (
          old_content !== undefined &&
          new_content !== undefined &&
          !file_path
        ) {
          return diffStrings(old_content, new_content);
        }

        // Mode 3: File path + content
        if (file_path && (old_content !== undefined || new_content !== undefined)) {
          const resolvedPath = expandPath(file_path, cwd);
          const fileContent = await readFile(resolvedPath, 'utf-8');

          if (old_content !== undefined) {
            // Compare provided old_content against the file
            return diffStrings(old_content, fileContent, {
              oldLabel: 'provided',
              newLabel: resolvedPath,
            });
          }

          // Compare the file against provided new_content
          return diffStrings(fileContent, new_content!, {
            oldLabel: resolvedPath,
            newLabel: 'provided',
          });
        }

        return (
          'Error [diff]: Insufficient parameters. Provide either: ' +
          '(1) file_path + other_file_path, ' +
          '(2) old_content + new_content, or ' +
          '(3) file_path + old_content/new_content.'
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [diff]: ${msg}`;
      }
    },
  });
}

/**
 * Default diff tool instance using the current working directory.
 *
 * @example
 * ```typescript
 * import { diff } from 'agentool/diff';
 * const result = await diff.execute(
 *   { old_content: 'hello\n', new_content: 'world\n' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export const diff = createDiff();
