import type { WebFetchConfig } from './index.js';

/**
 * Generate the description prompt for the web-fetch tool.
 *
 * @param config - The same config passed to {@link createWebFetch}.
 * @returns The full description string for the web-fetch tool.
 */
export function getPrompt(
  config: Pick<WebFetchConfig, 'timeout'> = {},
): string {
  const timeout = config.timeout ?? 30_000;

  return `Fetch a URL and return its content. HTML pages are automatically converted to markdown for easier reading. JSON and other text content is returned as-is.

## When to Use
- To retrieve and read web page content, documentation, or articles
- To fetch API responses, JSON data, or raw text from URLs
- To check what a web page contains

## When NOT to Use
- For API interactions that need custom HTTP methods (POST, PUT, DELETE) — use the dedicated HTTP request tool instead
- For searching the web — use the dedicated web search tool instead

## Usage Guidelines
- Content is truncated at 100,000 characters to manage context size
- The URL must be a fully-formed valid URL (e.g., https://example.com)
- Timeout: ${timeout}ms
- This tool is read-only — it does not modify any files or state`;
}
