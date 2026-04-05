/**
 * Generate the description prompt for the edit tool.
 *
 * @returns The full description string for the edit tool.
 */
export function getPrompt(): string {
  return `Perform an exact string replacement in a file. Locates old_string and replaces it with new_string.

Supports absolute paths, relative paths, and tilde (~) expansion. Includes curly-quote fallback matching and quote-style preservation.

## When to Use
- To make targeted changes to existing files
- To rename variables, update configuration values, or fix bugs
- Prefer this over the file writing tool for modifying existing files — it only changes what you specify

## When NOT to Use
- To create a new file from scratch — use the file writing tool instead
- To make many changes at once — consider the multi-edit tool for batch operations

## Usage Guidelines
- The edit will fail if \`old_string\` is not found in the file
- When \`replace_all\` is false (default), \`old_string\` must appear exactly once in the file. If it appears multiple times, provide more surrounding context to make it unique, or set \`replace_all: true\`
- Use \`replace_all: true\` for renaming a variable or string across the entire file
- Preserve exact indentation (tabs/spaces) from the original file in both old_string and new_string
- old_string and new_string must be different`;
}
