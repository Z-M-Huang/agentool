import { tool } from 'ai';
import { z } from 'zod';
import type { TimeoutConfig } from '../shared/types.js';
import { fetchUrl } from '../shared/fetch.js';
import { extractErrorMessage } from '../shared/errors.js';
import { getPrompt } from './prompt.js';

export { getPrompt as webFetchPrompt } from './prompt.js';

/**
 * Configuration for the web-fetch tool.
 * Extends {@link TimeoutConfig} with optional content-length cap and user-agent.
 *
 * @example
 * ```typescript
 * const config: WebFetchConfig = {
 *   timeout: 10000,
 *   maxContentLength: 5 * 1024 * 1024,
 *   userAgent: 'my-agent/1.0',
 * };
 * ```
 */
export interface WebFetchConfig extends TimeoutConfig {
  /** Maximum response body size in bytes. Passed to {@link fetchUrl}. */
  maxContentLength?: number;
  /** Custom User-Agent header sent with every request. */
  userAgent?: string;
  /** Override the default tool description. */
  description?: string;
}

/**
 * Factory that creates a web-fetch tool with the given configuration.
 * The returned tool fetches a URL, automatically converts HTML to markdown
 * via turndown, and truncates content at 100 000 characters.
 *
 * @param config - Optional configuration (timeout, max content length, user agent).
 * @returns An AI SDK tool instance for fetching web pages.
 *
 * @example
 * ```typescript
 * import { createWebFetch } from 'agentool/web-fetch';
 * const myTool = createWebFetch({ timeout: 5000 });
 * ```
 */
export function createWebFetch(config: WebFetchConfig = {}) {
  return tool({
    description: config.description ?? getPrompt(config),
    inputSchema: z.object({
      url: z.string().url().describe('The URL to fetch'),
    }),
    execute: async ({ url }) => {
      try {
        const result = await fetchUrl(url, {
          timeout: config.timeout ?? 30000,
          maxContentLength: config.maxContentLength,
          userAgent: config.userAgent,
        });

        const parts: string[] = [];
        parts.push(`URL: ${url}`);
        parts.push(`Status: ${result.statusCode}`);
        parts.push(`Content-Type: ${result.contentType}`);
        if (result.truncated) {
          parts.push('(Content truncated to 100,000 characters)');
        }
        parts.push('');
        parts.push(result.content);

        return parts.join('\n');
      } catch (error) {
        const msg = extractErrorMessage(error);
        return `Error [web-fetch]: Failed to fetch ${url}: ${msg}`;
      }
    },
  });
}

/**
 * Pre-configured web-fetch tool with default settings.
 * Uses a 30 000 ms timeout, no content-length cap override, and no custom user-agent.
 *
 * @example
 * ```typescript
 * import { webFetch } from 'agentool/web-fetch';
 * // Register directly with your AI SDK agent
 * ```
 */
export const webFetch = createWebFetch();
