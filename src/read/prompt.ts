import type { ReadConfig } from './index.js';

/**
 * Generate the description prompt for the read tool based on its configuration.
 *
 * @param config - The same config passed to {@link createRead}.
 * @returns The full description string for the read tool.
 */
export function getPrompt(
  config: Pick<ReadConfig, 'maxLines'> = {},
): string {
  const maxLines = config.maxLines ?? 2000;

  return `Read a file and return its contents with line numbers.

Supports absolute paths, relative paths (resolved against the working directory), and tilde (~) home directory expansion. Returns numbered lines in "lineNumber\\tcontent" format.

## When to Use
- To examine source code, configuration files, or any text file
- Before editing a file — read it first to understand its current content
- To check specific sections of large files using offset and limit

## When NOT to Use
- To list directory contents — use a shell command instead
- To search across many files — use the dedicated content search tool instead
- To find files by name — use the dedicated file search tool instead

## Usage Guidelines
- By default, reads up to ${maxLines} lines from the start of the file
- Use \`offset\` and \`limit\` to read specific ranges of large files rather than reading the entire file
- When you already know which part of the file you need, read only that part to save context
- Results use cat -n style line numbering starting at 1`;
}
