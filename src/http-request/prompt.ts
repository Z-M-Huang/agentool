import type { HttpRequestConfig } from './index.js';

/**
 * Generate the description prompt for the http-request tool.
 *
 * @param config - The same config passed to {@link createHttpRequest}.
 * @returns The full description string for the http-request tool.
 */
export function getPrompt(
  config: Pick<HttpRequestConfig, 'timeout'> = {},
): string {
  const timeout = config.timeout ?? 30_000;

  return `Make an HTTP request to a URL. Returns the raw response status, headers, and body as JSON.

Supports GET, POST, PUT, PATCH, DELETE, and HEAD methods.

## When to Use
- For API interactions: REST calls, webhook triggers, service health checks
- When you need full control over HTTP method, headers, and request body
- When you need the raw response (status codes, headers) not just content

## When NOT to Use
- To read a web page for its content — use the web fetch tool instead (it converts HTML to markdown)
- To search the web — use the web search tool instead

## Usage Guidelines
- Default timeout: ${timeout}ms. Override with the timeout parameter.
- Request body is sent for POST, PUT, and PATCH methods
- Response is returned as JSON with status, statusText, headers, and body fields
- Default headers from config are merged with per-request headers (per-request takes precedence)`;
}
