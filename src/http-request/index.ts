import { tool } from 'ai';
import { z } from 'zod';
import type { TimeoutConfig } from '../shared/types.js';
import { getPrompt } from './prompt.js';

export { getPrompt as httpRequestPrompt } from './prompt.js';

/**
 * Configuration for the HTTP request tool.
 * Extends {@link TimeoutConfig} with optional default headers
 * applied to every request.
 *
 * @example
 * ```typescript
 * const config: HttpRequestConfig = {
 *   timeout: 10000,
 *   defaultHeaders: { Authorization: 'Bearer token' },
 * };
 * ```
 */
export interface HttpRequestConfig extends TimeoutConfig {
  /** Headers merged into every request (per-request headers take precedence). */
  defaultHeaders?: Record<string, string>;
  /** Override the default tool description. */
  description?: string;
}

/**
 * Factory that creates an HTTP request tool with the given configuration.
 * The returned tool uses native `fetch()` and returns raw status, headers,
 * and body -- no markdown conversion.
 *
 * @param config - Optional configuration (timeout, default headers).
 * @returns An AI SDK tool instance for making HTTP requests.
 *
 * @example
 * ```typescript
 * import { createHttpRequest } from 'agentool/http-request';
 * const myTool = createHttpRequest({ timeout: 5000 });
 * ```
 */
export function createHttpRequest(config: HttpRequestConfig = {}) {
  return tool({
    description: config.description ?? getPrompt(config),
    inputSchema: z.object({
      method: z
        .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
        .describe('HTTP method'),
      url: z.string().describe('The URL to send the request to'),
      headers: z
        .record(z.string())
        .optional()
        .describe('Request headers as key-value pairs'),
      body: z
        .string()
        .optional()
        .describe('Request body (for POST, PUT, PATCH)'),
      timeout: z
        .number()
        .optional()
        .describe('Request timeout in milliseconds (default: 30000)'),
    }),
    execute: async ({ method, url, headers, body, timeout }) => {
      try {
        const timeoutMs = timeout ?? config.timeout ?? 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const mergedHeaders = { ...config.defaultHeaders, ...headers };

        const response = await fetch(url, {
          method,
          headers: mergedHeaders,
          body: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseBody = await response.text();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return JSON.stringify(
          {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
          },
          null,
          2,
        );
      } catch (error) {
        const effectiveTimeout = timeout ?? config.timeout ?? 30000;
        if (error instanceof Error && error.name === 'AbortError') {
          return (
            `Error [http-request]: Request timed out after ` +
            `${effectiveTimeout}ms for ${method} ${url}. ` +
            `Try increasing the timeout or verify the server is responsive.`
          );
        }
        const msg = error instanceof Error ? error.message : String(error);
        return (
          `Error [http-request]: ${method} ${url} failed: ${msg}. ` +
          `Verify the URL is correct and the server is reachable.`
        );
      }
    },
  });
}

/**
 * Pre-configured HTTP request tool with default settings.
 * Uses a 30 000 ms timeout and no default headers.
 *
 * @example
 * ```typescript
 * import { httpRequest } from 'agentool/http-request';
 * // Register directly with your AI SDK agent
 * ```
 */
export const httpRequest = createHttpRequest();
