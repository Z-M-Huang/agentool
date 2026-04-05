/**
 * Generate the description prompt for the write tool.
 *
 * @returns The full description string for the write tool.
 */
export function getPrompt(): string {
  return `Write text content to a file, creating parent directories as needed. If the file already exists it is overwritten entirely.

Supports absolute paths, relative paths, and tilde (~) expansion.

## When to Use
- To create new files that don't exist yet
- To completely rewrite an existing file's content
- When the changes are so extensive that targeted editing would be impractical

## When NOT to Use
- To make small, targeted changes to an existing file — use the file editing tool instead (it only changes what you specify and is less error-prone)
- Prefer the editing tool for modifications; reserve this tool for creating new files or complete rewrites

## Usage Guidelines
- This tool overwrites the entire file — make sure you include all desired content, not just the changes
- Parent directories are created automatically if they don't exist
- Read the existing file first before overwriting it, so you don't accidentally lose content`;
}
