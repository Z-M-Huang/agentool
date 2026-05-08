/**
 * Generate the description prompt for the glob tool.
 *
 * @returns The full description string for the glob tool.
 */
export function getPrompt(): string {
  return `Fast file pattern matching tool that works with any codebase size.
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- Use the content search tool when you need to search inside files`;
}
