/**
 * Generate the description prompt for the grep tool.
 *
 * @returns The full description string for the grep tool.
 */
export function getPrompt(): string {
  return `Search file contents using ripgrep.

Usage:
- Use this tool for search tasks instead of shell grep or rg
- Supports ripgrep regex syntax, e.g. "log.*Error" or "function\\s+\\w+"
- Filter files with glob (e.g. "*.js", "**/*.tsx") or type (e.g. "js", "py", "rust")
- output_mode: "files_with_matches" returns paths (default), "content" returns matching lines, "count" returns match counts
- Default head_limit is 250 entries. Pass head_limit: 0 for unlimited
- Use offset to paginate large result sets
- For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use multiline: true`;
}
