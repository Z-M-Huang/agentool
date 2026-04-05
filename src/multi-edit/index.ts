import { readFile } from 'node:fs/promises';
import { tool } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';
import { expandPath } from '../shared/path.js';
import { writeTextContent } from '../shared/file.js';
import {
  findActualString,
  preserveQuoteStyle,
  applyEditToFile,
} from '../shared/edit-helpers.js';

/**
 * Configuration for the multi-edit tool.
 *
 * @example
 * ```typescript
 * import type { MultiEditConfig } from 'agentool/multi-edit';
 * const config: MultiEditConfig = { cwd: '/my/project' };
 * ```
 */
export type MultiEditConfig = BaseToolConfig;

/**
 * Count non-overlapping occurrences of `search` in `text`.
 */
function countOccurrences(text: string, search: string): number {
  if (search.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

/**
 * Creates a multi-edit tool that atomically applies multiple string
 * replacements to a single file.
 *
 * All edits are validated and applied in memory first. The file is only
 * written when every edit succeeds. If any edit fails (not found or
 * non-unique), the file is left unchanged and an error is returned.
 *
 * @param config - Optional configuration for the working directory.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createMultiEdit } from 'agentool/multi-edit';
 *
 * const multiEditTool = createMultiEdit({ cwd: '/my/project' });
 * const result = await multiEditTool.execute(
 *   {
 *     file_path: 'src/index.ts',
 *     edits: [
 *       { old_string: 'foo', new_string: 'bar' },
 *       { old_string: 'baz', new_string: 'qux' },
 *     ],
 *   },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createMultiEdit(config: MultiEditConfig = {}) {
  const cwd = config.cwd ?? process.cwd();

  return tool({
    description:
      'Atomically apply multiple text edits to a single file. ' +
      'All edits succeed together or none are applied (rollback on failure). ' +
      'Each edit replaces one occurrence of old_string with new_string. ' +
      'Edits are applied sequentially in the order provided.',
    inputSchema: z.object({
      file_path: z
        .string()
        .describe('Path to the file to edit (absolute or relative to cwd)'),
      edits: z
        .array(
          z.object({
            old_string: z
              .string()
              .describe('The exact string to find and replace'),
            new_string: z
              .string()
              .describe('The replacement string'),
          }),
        )
        .describe('Ordered list of edits to apply atomically'),
    }),
    execute: async ({ file_path, edits }) => {
      try {
        if (edits.length === 0) {
          return 'No edits provided. File unchanged.';
        }

        const resolvedPath = expandPath(file_path, cwd);
        const originalContent = await readFile(resolvedPath, 'utf-8');

        let content = originalContent;

        for (let i = 0; i < edits.length; i++) {
          const edit = edits[i]!;
          const actualOldString = findActualString(content, edit.old_string);

          if (actualOldString === null) {
            return (
              `Error [multi-edit]: Edit ${i + 1}/${edits.length} failed — ` +
              `old_string not found in file. ` +
              `No edits were applied. ` +
              `File: ${resolvedPath}`
            );
          }

          const occurrences = countOccurrences(content, actualOldString);
          if (occurrences > 1) {
            return (
              `Error [multi-edit]: Edit ${i + 1}/${edits.length} failed — ` +
              `old_string matches ${occurrences} locations (must be unique). ` +
              `No edits were applied. ` +
              `File: ${resolvedPath}`
            );
          }

          const styledNewString = preserveQuoteStyle(
            edit.old_string,
            actualOldString,
            edit.new_string,
          );

          content = applyEditToFile(content, actualOldString, styledNewString);
        }

        await writeTextContent(resolvedPath, content);

        return (
          `Successfully applied ${edits.length} edit${edits.length === 1 ? '' : 's'} ` +
          `to ${resolvedPath}`
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [multi-edit]: ${msg}`;
      }
    },
  });
}

/**
 * Default multi-edit tool instance using the current working directory.
 *
 * @example
 * ```typescript
 * import { multiEdit } from 'agentool/multi-edit';
 * const result = await multiEdit.execute(
 *   {
 *     file_path: 'file.txt',
 *     edits: [{ old_string: 'a', new_string: 'b' }],
 *   },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export const multiEdit = createMultiEdit();
