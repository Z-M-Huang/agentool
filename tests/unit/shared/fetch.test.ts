import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import {
  fetchUrl,
  getTurndownService,
  _resetTurndownSingleton,
  MAX_MARKDOWN_LENGTH,
  type FetchOptions,
  type FetchResult,
} from '../../../src/shared/fetch.js';

// ---------------------------------------------------------------------------
// Lazy turndown singleton
// ---------------------------------------------------------------------------

describe('getTurndownService', () => {
  beforeEach(() => {
    _resetTurndownSingleton();
  });

  it('returns an object with a turndown method', async () => {
    const service = await getTurndownService();
    expect(typeof service.turndown).toBe('function');
  }, 15_000);

  it('returns the same instance on subsequent calls (singleton)', async () => {
    const first = await getTurndownService();
    const second = await getTurndownService();
    expect(first).toBe(second);
  });

  it('converts basic HTML to markdown', async () => {
    const service = await getTurndownService();
    const md = service.turndown('<h1>Hello</h1><p>World</p>');
    expect(md).toContain('Hello');
    expect(md).toContain('World');
  });
});

// ---------------------------------------------------------------------------
// Interface type checks
// ---------------------------------------------------------------------------

describe('FetchOptions interface', () => {
  it('accepts an empty object (all fields optional)', () => {
    const opts: FetchOptions = {};
    expect(opts).toEqual({});
  });

  it('accepts all optional fields', () => {
    const controller = new AbortController();
    const opts: FetchOptions = {
      timeout: 5000,
      maxContentLength: 1024,
      userAgent: 'test-agent',
      signal: controller.signal,
    };
    expect(opts.timeout).toBe(5000);
    expect(opts.maxContentLength).toBe(1024);
    expect(opts.userAgent).toBe('test-agent');
    expect(opts.signal).toBe(controller.signal);
  });
});

describe('FetchResult interface', () => {
  it('holds all required fields', () => {
    const result: FetchResult = {
      content: '# Hello',
      contentType: 'text/html',
      statusCode: 200,
      byteLength: 42,
      truncated: false,
    };
    expect(result.content).toBe('# Hello');
    expect(result.contentType).toBe('text/html');
    expect(result.statusCode).toBe(200);
    expect(result.byteLength).toBe(42);
    expect(result.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MAX_MARKDOWN_LENGTH constant
// ---------------------------------------------------------------------------

describe('MAX_MARKDOWN_LENGTH', () => {
  it('equals 100 000', () => {
    expect(MAX_MARKDOWN_LENGTH).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// Integration tests with a local HTTP server
// ---------------------------------------------------------------------------

describe('fetchUrl (local server)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = createServer((req, res) => {
          if (req.url === '/plain') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Hello, plain text!');
          } else if (req.url === '/html') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>Title</h1><p>Paragraph body.</p>');
          } else if (req.url === '/large') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            // Content larger than MAX_MARKDOWN_LENGTH
            res.end('x'.repeat(MAX_MARKDOWN_LENGTH + 500));
          } else if (req.url === '/json') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ key: 'value' }));
          } else if (req.url === '/slow') {
            // Never respond — used for timeout testing
          } else if (req.url === '/huge') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            // Stream data that exceeds maxContentLength
            const chunk = Buffer.alloc(1024 * 1024, 'A');
            for (let i = 0; i < 12; i++) {
              res.write(chunk);
            }
            res.end();
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
          }
        });
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  );

  it('fetches plain text without conversion', async () => {
    const result = await fetchUrl(`${baseUrl}/plain`);
    expect(result.content).toBe('Hello, plain text!');
    expect(result.contentType).toBe('text/plain');
    expect(result.statusCode).toBe(200);
    expect(result.byteLength).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  it('converts HTML to markdown via turndown', async () => {
    const result = await fetchUrl(`${baseUrl}/html`);
    expect(result.contentType).toContain('text/html');
    expect(result.content).toContain('Title');
    expect(result.content).toContain('Paragraph body.');
    // Should not contain raw HTML tags after conversion
    expect(result.content).not.toContain('<h1>');
    expect(result.content).not.toContain('<p>');
    expect(result.truncated).toBe(false);
  });

  it('truncates content exceeding MAX_MARKDOWN_LENGTH', async () => {
    const result = await fetchUrl(`${baseUrl}/large`);
    expect(result.content.length).toBe(MAX_MARKDOWN_LENGTH);
    expect(result.truncated).toBe(true);
  });

  it('returns non-HTML content types as-is', async () => {
    const result = await fetchUrl(`${baseUrl}/json`);
    expect(result.contentType).toContain('application/json');
    const parsed = JSON.parse(result.content) as { key: string };
    expect(parsed.key).toBe('value');
  });

  it('reports correct byteLength from raw response', async () => {
    const result = await fetchUrl(`${baseUrl}/plain`);
    expect(result.byteLength).toBe(
      Buffer.byteLength('Hello, plain text!', 'utf-8'),
    );
  });

  it('aborts on timeout', async () => {
    await expect(
      fetchUrl(`${baseUrl}/slow`, { timeout: 200 }),
    ).rejects.toThrow();
  });

  it('aborts when caller signal fires', async () => {
    const controller = new AbortController();
    // Abort immediately
    controller.abort();
    await expect(
      fetchUrl(`${baseUrl}/plain`, { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it('throws when response exceeds maxContentLength', async () => {
    await expect(
      fetchUrl(`${baseUrl}/huge`, { maxContentLength: 1024 }),
    ).rejects.toThrow(/maxContentLength/);
  });

  it('passes custom User-Agent header', async () => {
    // Just verify it does not throw — we can't inspect the header from
    // the client side, but the server receives it.
    const result = await fetchUrl(`${baseUrl}/plain`, {
      userAgent: 'custom-agent/1.0',
    });
    expect(result.statusCode).toBe(200);
  });
});
