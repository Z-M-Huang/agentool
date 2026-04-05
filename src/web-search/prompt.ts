/**
 * Generate the description prompt for the web-search tool.
 *
 * @returns The full description string for the web-search tool.
 */
export function getPrompt(): string {
  return `Search the web for information using a search query. Results can be filtered by allowed or blocked domains.

Requires an onSearch callback to be configured — the application provides the actual search implementation.

## When to Use
- To find current information beyond the model's training data
- To look up documentation, recent news, or real-time data
- To verify facts or find authoritative sources

## When NOT to Use
- To read a specific URL whose address you already know — use the web fetch tool instead
- To search file contents in the local codebase — use the dedicated content search tool instead

## Usage Guidelines
- After answering a question using search results, include a "Sources:" section listing the relevant URLs
- Use the current year when searching for recent information or documentation
- Use \`allowed_domains\` to restrict results to specific sites (e.g., ["docs.python.org"])
- Use \`blocked_domains\` to exclude specific sites from results`;
}
