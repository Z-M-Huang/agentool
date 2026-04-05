/**
 * Generate the description prompt for the tool-search tool.
 *
 * @returns The full description string for the tool-search tool.
 */
export function getPrompt(): string {
  return `Search for available tools by name or keyword. Returns matching tool names and their descriptions.

Uses fuzzy matching — scores results by name and description relevance.

## When to Use
- To discover what tools are available when you're unsure which tool to use
- To find the right tool for a specific task by searching with keywords

## When NOT to Use
- When you already know the tool name — just use it directly

## Usage Guidelines
- Requires a tools registry to be configured via createToolSearch({ tools: { ... } })
- Returns up to \`max_results\` matches (default: 5), sorted by relevance
- Matches against both tool names and descriptions`;
}
