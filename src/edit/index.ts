import { readFile, writeFile } from 'node:fs/promises';
import { tool } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';
import { expandPath } from '../shared/path.js';

export type EditConfig = BaseToolConfig;
import {
  findActualString,
  preserveQuoteStyle,
  applyEditToFile,
} from '../shared/edit-helpers.js';

/**
 * Creates an edit tool that performs string replacements in files.
 *
 * The tool locates `old_string` within the target file and replaces it with
 * `new_string`. It supports curly-quote fallback matching via
 * {@link findActualString} and preserves the file's quote style via
 * {@link preserveQuoteStyle}. Execute never throws; errors are returned as
 * descriptive strings.
 *
 * @param config - Optional configuration for the working directory.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createEdit } from 'agentool/edit';
 *
 * const editTool = createEdit({ cwd: '/my/project' });
 * const result = await editTool.execute(
 *   { file_path: 'src/index.ts', old_string: 'foo', new_string: 'bar' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createEdit(config: BaseToolConfig = {}) {
  return tool({
    description:
      'Perform an exact string replacement in a file. ' +
      'Locates old_string in the file and replaces it with new_string. ' +
      'Supports curly-quote fallback matching. ' +
      'When replace_all is false (default), old_string must appear exactly once.',
    inputSchema: z.object({
      file_path: z.string().describe('Path to the file to edit'),
      old_string: z.string().describe('The exact string to find and replace'),
      new_string: z.string().describe('The replacement string'),
      replace_all: z
        .boolean()
        .optional()
        .default(false)
        .describe('Replace all occurrences (default: false)'),
    }),
    execute: async ({ file_path, old_string, new_string, replace_all }) => {
      try {
        // 1. Resolve path
        const resolved = expandPath(file_path, config.cwd);

        // 2. Read file
        let content: string;
        try {
          content = await readFile(resolved, 'utf-8');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error [edit]: Cannot read file "${resolved}": ${msg}`;
        }

        // 3. Validate: old_string !== new_string
        if (old_string === new_string) {
          return 'Error [edit]: old_string and new_string are identical — nothing to change.';
        }

        // 4. Find the actual string (with curly-quote fallback)
        const actualOld = findActualString(content, old_string);

        // 5. Not found
        if (actualOld === null) {
          const preview = content.slice(0, 200);
          return (
            `Error [edit]: old_string not found in "${resolved}". ` +
            `File starts with:\n${preview}`
          );
        }

        // 6. Uniqueness check when not replace_all
        if (!replace_all) {
          let count = 0;
          let pos = 0;
          while (pos < content.length) {
            const idx = content.indexOf(actualOld, pos);
            if (idx === -1) break;
            count++;
            pos = idx + 1;
          }
          if (count > 1) {
            return (
              `Error [edit]: old_string appears ${count} times in "${resolved}". ` +
              'Use replace_all to replace every occurrence, or provide a more specific string.'
            );
          }
        }

        // 7. Apply edit with quote-style preservation
        const styledNew = preserveQuoteStyle(old_string, actualOld, new_string);
        const updated = applyEditToFile(content, actualOld, styledNew, replace_all);

        // 8. Write back
        await writeFile(resolved, updated, 'utf-8');

        // 9. Success message with snippet
        const snippet = styledNew.length > 0
          ? styledNew.slice(0, 200)
          : '(deletion)';
        return `Successfully edited "${resolved}". Replacement snippet:\n${snippet}`;
      } catch (error: unknown) {
        // 10. Never throw
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [edit]: ${msg}`;
      }
    },
  });
}

/**
 * Default edit tool instance using the current working directory.
 *
 * @example
 * ```typescript
 * import { edit } from 'agentool/edit';
 * const result = await edit.execute(
 *   { file_path: 'src/index.ts', old_string: 'foo', new_string: 'bar' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export const edit = createEdit();
