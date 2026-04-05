import type TurndownService from 'turndown';

/**
 * Options for {@link fetchUrl}.
 *
 * @example
 * ```typescript
 * const opts: FetchOptions = { timeout: 5000, maxContentLength: 1024 * 1024 };
 * ```
 */
export interface FetchOptions {
  /** Request timeout in milliseconds. Defaults to 30 000. */
  timeout?: number;
  /** Maximum response body size in bytes. Defaults to 10 MB. */
  maxContentLength?: number;
  /** Custom User-Agent header. */
  userAgent?: string;
  /** Caller-supplied abort signal, composed with the timeout signal. */
  signal?: AbortSignal;
}

/**
 * Result returned by {@link fetchUrl}.
 *
 * @example
 * ```typescript
 * const result: FetchResult = {
 *   content: '# Hello',
 *   contentType: 'text/html',
 *   statusCode: 200,
 *   byteLength: 42,
 *   truncated: false,
 * };
 * ```
 */
export interface FetchResult {
  /** The response body — markdown when the source was HTML, raw text otherwise. */
  content: string;
  /** The Content-Type header value from the response. */
  contentType: string;
  /** HTTP status code. */
  statusCode: number;
  /** Raw response body size in bytes (before conversion / truncation). */
  byteLength: number;
  /** `true` when the content was truncated to {@link MAX_MARKDOWN_LENGTH}. */
  truncated: boolean;
}

/**
 * Maximum character length for returned content.
 * Matches the constant in Claude Code's WebFetchTool.
 */
export const MAX_MARKDOWN_LENGTH = 100_000;

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Default maximum response body size in bytes (10 MB). */
const DEFAULT_MAX_CONTENT_LENGTH = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Lazy turndown singleton
// ---------------------------------------------------------------------------

type TurndownCtor = typeof import('turndown');

let turndownPromise: Promise<TurndownService> | undefined;

/**
 * Return a lazily-initialised, reused {@link TurndownService} instance.
 *
 * The first call dynamically imports the `turndown` package (CJS, wrapped
 * in `{ default }` by the ESM loader) and constructs a singleton.
 * Subsequent calls resolve to the same instance immediately.
 *
 * Exported for testing — not part of the public API contract.
 */
export function getTurndownService(): Promise<TurndownService> {
  return (turndownPromise ??= import('turndown').then((m) => {
    const Turndown = (m as unknown as { default: TurndownCtor }).default;
    return new Turndown();
  }));
}

/**
 * Reset the lazy turndown singleton.
 * Intended for test isolation only.
 */
export function _resetTurndownSingleton(): void {
  turndownPromise = undefined;
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

/**
 * Compose an {@link AbortSignal} that fires when **either** the timeout
 * elapses or the optional caller signal aborts.
 */
function composeSignal(
  timeoutMs: number,
  userSignal?: AbortSignal,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!userSignal) {
    return timeoutSignal;
  }
  return AbortSignal.any([timeoutSignal, userSignal]);
}

/**
 * Fetch a URL, optionally converting HTML responses to markdown via turndown.
 *
 * - Uses the native `fetch()` API (Node 18+).
 * - Sends `Accept: text/markdown, text/html, *\/*`.
 * - HTML responses (`content-type` includes `text/html`) are converted to
 *   markdown with turndown (lazily loaded on first use).
 * - Content is truncated at {@link MAX_MARKDOWN_LENGTH} characters.
 * - Timeout is implemented via `AbortSignal.timeout()`, composed with an
 *   optional caller-supplied signal.
 *
 * @param url     - The URL to fetch (must be http or https).
 * @param options - Optional {@link FetchOptions}.
 * @returns A {@link FetchResult} with the (possibly converted) content.
 * @throws On network errors, timeouts, or if the response body exceeds
 *         `maxContentLength`.
 *
 * @example
 * ```typescript
 * import { fetchUrl } from 'agentool/shared/fetch';
 *
 * const result = await fetchUrl('https://example.com');
 * console.log(result.content);     // markdown or raw text
 * console.log(result.truncated);   // true if content was capped
 * ```
 */
export async function fetchUrl(
  url: string,
  options?: FetchOptions,
): Promise<FetchResult> {
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;

  const signal = composeSignal(timeoutMs, options?.signal);

  const headers: Record<string, string> = {
    Accept: 'text/markdown, text/html, */*',
  };
  if (options?.userAgent) {
    headers['User-Agent'] = options.userAgent;
  }

  const response = await fetch(url, { signal, headers });

  // Stream the body while enforcing a byte-size cap.
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(
          `Response body exceeds maxContentLength (${maxBytes} bytes)`,
        );
      }
      chunks.push(value);
    }
  }

  const rawBuffer = Buffer.concat(chunks);
  const byteLength = rawBuffer.length;
  const contentType = response.headers.get('content-type') ?? '';
  const textContent = rawBuffer.toString('utf-8');

  // Convert HTML to markdown via turndown.
  let content: string;
  if (contentType.includes('text/html')) {
    const td = await getTurndownService();
    content = td.turndown(textContent);
  } else {
    content = textContent;
  }

  // Truncate if necessary.
  let truncated = false;
  if (content.length > MAX_MARKDOWN_LENGTH) {
    content = content.slice(0, MAX_MARKDOWN_LENGTH);
    truncated = true;
  }

  return {
    content,
    contentType,
    statusCode: response.status,
    byteLength,
    truncated,
  };
}
