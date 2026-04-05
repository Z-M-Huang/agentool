import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import {
  createWebFetch,
  webFetch,
  type WebFetchConfig,
} from '../../src/web-fetch/index.js';

// ---------------------------------------------------------------------------
// Local HTTP server used by all tests
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url === '/html') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body><h1>Hello</h1><p>World</p></body></html>',
          );
        } else if (req.url === '/json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ greeting: 'hello' }));
        } else if (req.url === '/plain') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('plain text content');
        } else if (req.url === '/headers') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(req.headers));
        } else if (req.url === '/slow') {
          // Never respond -- used for timeout testing
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('not found');
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('webFetch default export', () => {
  it('exists and has an execute function', () => {
    expect(webFetch).toBeDefined();
    expect(typeof webFetch.execute).toBe('function');
  });

  it('has a description string', () => {
    expect(typeof webFetch.description).toBe('string');
    expect(webFetch.description!.length).toBeGreaterThan(0);
  });

  it('has an input schema defined', () => {
    expect(webFetch.inputSchema).toBeDefined();
  });
});

describe('WebFetchConfig interface', () => {
  it('accepts an empty object', () => {
    const cfg: WebFetchConfig = {};
    expect(cfg).toEqual({});
  });
});

describe('createWebFetch', () => {
  it('fetches HTML and converts to markdown (no raw HTML tags)', async () => {
    const tool = createWebFetch();
    const result = await tool.execute(
      { url: `${baseUrl}/html` },
      { toolCallId: 't1', messages: [] },
    );
    // Must include metadata lines
    expect(result).toContain(`URL: ${baseUrl}/html`);
    expect(result).toContain('Status: 200');
    expect(result).toContain('Content-Type: text/html');
    // Converted to markdown -- should contain heading and text
    expect(result).toContain('Hello');
    expect(result).toContain('World');
    // Must NOT contain raw HTML tags
    expect(result).not.toContain('<h1>');
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('<html>');
    expect(result).not.toContain('<body>');
  });

  it('fetches JSON and returns it as-is', async () => {
    const tool = createWebFetch();
    const result = await tool.execute(
      { url: `${baseUrl}/json` },
      { toolCallId: 't2', messages: [] },
    );
    expect(result).toContain(`URL: ${baseUrl}/json`);
    expect(result).toContain('Status: 200');
    expect(result).toContain('Content-Type: application/json');
    expect(result).toContain('"greeting"');
    expect(result).toContain('"hello"');
  });

  it('returns error string for unreachable URL', async () => {
    const tool = createWebFetch();
    const result = await tool.execute(
      { url: 'http://256.256.256.256:1/nope' },
      { toolCallId: 't3', messages: [] },
    );
    expect(result).toContain('Error [web-fetch]');
    expect(result).toContain('Failed to fetch');
  });

  it('factory with custom config passes userAgent', async () => {
    const tool = createWebFetch({ userAgent: 'test-agent/1.0' });
    const result = await tool.execute(
      { url: `${baseUrl}/headers` },
      { toolCallId: 't4', messages: [] },
    );
    expect(result).toContain('test-agent/1.0');
  });

  it('factory with custom timeout triggers error on slow endpoint', async () => {
    const tool = createWebFetch({ timeout: 100 });
    const result = await tool.execute(
      { url: `${baseUrl}/slow` },
      { toolCallId: 't5', messages: [] },
    );
    expect(result).toContain('Error [web-fetch]');
    expect(result).toContain('Failed to fetch');
  });

  it('accepts optional prompt parameter without error', async () => {
    const tool = createWebFetch();
    const result = await tool.execute(
      { url: `${baseUrl}/plain`, prompt: 'extract keywords' },
      { toolCallId: 't6', messages: [] },
    );
    expect(result).toContain('Status: 200');
    expect(result).toContain('plain text content');
  });

  it('reports truncation for very large content', async () => {
    // Create a server endpoint that returns >100k chars
    const bigServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      // 200k chars -- will be truncated at 100k by fetchUrl
      res.end('A'.repeat(200_000));
    });
    await new Promise<void>((resolve) => {
      bigServer.listen(0, '127.0.0.1', () => resolve());
    });
    const bigAddr = bigServer.address() as AddressInfo;
    const bigUrl = `http://127.0.0.1:${bigAddr.port}/`;

    try {
      const tool = createWebFetch();
      const result = await tool.execute(
        { url: bigUrl },
        { toolCallId: 'big-test', messages: [] },
      );
      expect(result).toContain('Content truncated');
    } finally {
      await new Promise<void>((resolve) => bigServer.close(() => resolve()));
    }
  });
});
