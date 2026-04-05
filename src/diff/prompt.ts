/**
 * Generate the description prompt for the diff tool.
 *
 * @returns The full description string for the diff tool.
 */
export function getPrompt(): string {
  return `Generate a unified diff between two files or two strings.

Supports three modes:
1. **Two file paths**: \`file_path\` + \`other_file_path\` — compares the contents of both files
2. **Two strings**: \`old_content\` + \`new_content\` — compares the provided strings directly
3. **File + string**: \`file_path\` + \`old_content\` or \`new_content\` — compares a file against provided content

## When to Use
- To preview what changes would look like before making edits
- To compare two versions of a file or text
- To generate a diff for review or documentation purposes

## When NOT to Use
- To actually apply changes to a file — use the file editing tool instead
- To read file contents — use the file reading tool instead`;
}
