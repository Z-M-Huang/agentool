import { readFile } from 'node:fs/promises';
import { createTwoFilesPatch } from 'diff';

/**
 * Options for controlling diff output.
 */
export interface DiffOptions {
  /** Number of context lines surrounding each change. Defaults to 3. */
  context?: number;
}

/**
 * Generate a unified diff between two strings.
 *
 * Uses `createTwoFilesPatch` from the `diff` npm package under the hood.
 * Returns the unified diff as a string, or `"No differences found."` when
 * the two inputs are identical.
 *
 * @param oldContent - The original content.
 * @param newContent - The modified content.
 * @param options    - Diff options plus optional labels for the header.
 * @returns A unified diff string, or `"No differences found."`.
 *
 * @example
 * ```typescript
 * const patch = diffStrings('hello\n', 'hello world\n');
 * // Returns a unified diff showing the change.
 *
 * const same = diffStrings('a', 'a');
 * // Returns "No differences found."
 * ```
 */
export function diffStrings(
  oldContent: string,
  newContent: string,
  options?: DiffOptions & { oldLabel?: string; newLabel?: string },
): string {
  if (oldContent === newContent) {
    return 'No differences found.';
  }

  const context = options?.context ?? 3;
  const oldLabel = options?.oldLabel ?? 'a';
  const newLabel = options?.newLabel ?? 'b';

  return createTwoFilesPatch(
    oldLabel,
    newLabel,
    oldContent,
    newContent,
    undefined,
    undefined,
    { context },
  );
}

/**
 * Generate a unified diff between two files on disk.
 *
 * Reads both files with `fs.promises.readFile` (UTF-8), then delegates to
 * {@link diffStrings}. The file paths are used as diff header labels.
 *
 * @param oldFilePath - Path to the original file.
 * @param newFilePath - Path to the modified file.
 * @param options     - Diff options (e.g. number of context lines).
 * @returns A unified diff string, or `"No differences found."`.
 *
 * @example
 * ```typescript
 * const patch = await diffFiles('/tmp/old.txt', '/tmp/new.txt');
 * ```
 */
export async function diffFiles(
  oldFilePath: string,
  newFilePath: string,
  options?: DiffOptions,
): Promise<string> {
  const [oldContent, newContent] = await Promise.all([
    readFile(oldFilePath, 'utf-8'),
    readFile(newFilePath, 'utf-8'),
  ]);

  return diffStrings(oldContent, newContent, {
    ...options,
    oldLabel: oldFilePath,
    newLabel: newFilePath,
  });
}
