/**
 * Generate the description prompt for the glob tool.
 *
 * @returns The full description string for the glob tool.
 */
export function getPrompt(): string {
  return `Find files matching a glob pattern. Returns absolute file paths sorted by modification time (newest first).

Fast file pattern matching powered by ripgrep. Supports patterns like "**/*.ts", "src/**/*.js", or "*.json".

## When to Use
- To find files by name or extension across a codebase
- To locate configuration files, test files, or specific file types
- To discover project structure and file organization

## When NOT to Use
- To search file *contents* — use the dedicated content search tool instead
- To read a specific file whose path you already know — use the file reading tool directly

## Usage Guidelines
- Results are sorted by modification time (most recently modified first)
- The optional \`path\` parameter lets you narrow the search to a specific directory
- Results may be truncated for very large result sets`;
}
