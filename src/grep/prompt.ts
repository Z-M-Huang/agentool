/**
 * Generate the description prompt for the grep tool.
 *
 * @returns The full description string for the grep tool.
 */
export function getPrompt(): string {
  return `Search file contents using ripgrep. Supports regex patterns, context lines, and multiple output modes.

## When to Use
- To find where a function, variable, string, or pattern is used across files
- To search for specific code patterns, error messages, or configuration values
- To count occurrences of a pattern across a codebase

## When NOT to Use
- To find files by name/extension — use the dedicated file search tool instead
- To read a specific file — use the file reading tool instead
- Don't use shell commands (grep, rg) for content search when this tool is available

## Output Modes
- \`files_with_matches\` (default): Returns file paths containing matches, sorted by modification time. Best for discovering which files contain a pattern.
- \`content\`: Returns matching lines with optional context. Supports \`-A\` (after), \`-B\` (before), \`-C\` (context) for surrounding lines and \`-n\` for line numbers (default: true).
- \`count\`: Returns match counts per file with totals.

## Usage Guidelines
- Uses ripgrep regex syntax (not grep). Literal braces need escaping: use \`interface\\{\\}\` to find \`interface{}\`
- Filter files with the \`glob\` parameter (e.g., "*.js", "*.{ts,tsx}") or \`type\` parameter (e.g., "js", "py")
- Default head_limit is 250 entries. Pass \`head_limit: 0\` for unlimited (use sparingly — large results waste context)
- Use \`offset\` to paginate through large result sets
- Enable \`multiline: true\` for patterns that span lines (e.g., \`struct \\{[\\s\\S]*?field\`)
- Use \`-i: true\` for case-insensitive search`;
}
