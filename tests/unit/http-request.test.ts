import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import {
  createHttpRequest,
  httpRequest,
  type HttpRequestConfig,
} from '../../src/http-request/index.js';

// ---------------------------------------------------------------------------
// Local HTTP server used by all integration tests
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url === '/json' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ greeting: 'hello' }));
        } else if (req.url === '/echo' && req.method === 'POST') {
          let data = '';
          req.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(data);
          });
        } else if (req.url === '/head-check' && req.method === 'HEAD') {
          res.writeHead(204, { 'X-Custom': 'present' });
          res.end();
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

describe('httpRequest default export', () => {
  it('exists and has an execute function', () => {
    expect(httpRequest).toBeDefined();
    expect(typeof httpRequest.execute).toBe('function');
  });
});

describe('HttpRequestConfig interface', () => {
  it('accepts an empty object', () => {
    const cfg: HttpRequestConfig = {};
    expect(cfg).toEqual({});
  });
});

describe('createHttpRequest', () => {
  it('GET request returns status and JSON body', async () => {
    const tool = createHttpRequest();
    const raw = await tool.execute(
      { method: 'GET', url: `${baseUrl}/json` },
      { toolCallId: 't1', messages: [] },
    );
    const result = JSON.parse(raw) as {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('application/json');
    const body = JSON.parse(result.body) as { greeting: string };
    expect(body.greeting).toBe('hello');
  });

  it('POST sends body and receives echo', async () => {
    const tool = createHttpRequest();
    const raw = await tool.execute(
      {
        method: 'POST',
        url: `${baseUrl}/echo`,
        body: 'request-payload',
      },
      { toolCallId: 't2', messages: [] },
    );
    const result = JSON.parse(raw) as { status: number; body: string };
    expect(result.status).toBe(200);
    expect(result.body).toBe('request-payload');
  });

  it('HEAD returns status and custom header', async () => {
    const tool = createHttpRequest();
    const raw = await tool.execute(
      { method: 'HEAD', url: `${baseUrl}/head-check` },
      { toolCallId: 't3', messages: [] },
    );
    const result = JSON.parse(raw) as {
      status: number;
      headers: Record<string, string>;
    };
    expect(result.status).toBe(204);
    expect(result.headers['x-custom']).toBe('present');
  });

  it('timeout produces an error string', async () => {
    const tool = createHttpRequest();
    const result = await tool.execute(
      { method: 'GET', url: `${baseUrl}/slow`, timeout: 100 },
      { toolCallId: 't4', messages: [] },
    );
    expect(result).toContain('Error [http-request]');
    expect(result).toContain('timed out');
    expect(result).toContain('100ms');
  });

  it('bad host produces an error string', async () => {
    const tool = createHttpRequest();
    const result = await tool.execute(
      { method: 'GET', url: 'http://256.256.256.256:1/nope' },
      { toolCallId: 't5', messages: [] },
    );
    expect(result).toContain('Error [http-request]');
    expect(result).toContain('GET');
    expect(result).toContain('failed');
  });

  it('factory merges defaultHeaders with per-request headers', async () => {
    const tool = createHttpRequest({
      defaultHeaders: { 'X-Default': 'from-config' },
    });
    const raw = await tool.execute(
      {
        method: 'GET',
        url: `${baseUrl}/headers`,
        headers: { 'X-Extra': 'per-request' },
      },
      { toolCallId: 't6', messages: [] },
    );
    const result = JSON.parse(raw) as { body: string };
    const echoedHeaders = JSON.parse(result.body) as Record<string, string>;
    expect(echoedHeaders['x-default']).toBe('from-config');
    expect(echoedHeaders['x-extra']).toBe('per-request');
  });

  it('per-request headers override defaultHeaders', async () => {
    const tool = createHttpRequest({
      defaultHeaders: { 'X-Auth': 'default-token' },
    });
    const raw = await tool.execute(
      {
        method: 'GET',
        url: `${baseUrl}/headers`,
        headers: { 'X-Auth': 'override-token' },
      },
      { toolCallId: 't7', messages: [] },
    );
    const result = JSON.parse(raw) as { body: string };
    const echoedHeaders = JSON.parse(result.body) as Record<string, string>;
    expect(echoedHeaders['x-auth']).toBe('override-token');
  });

  it('config-level timeout is used when per-request timeout is omitted', async () => {
    const tool = createHttpRequest({ timeout: 100 });
    const result = await tool.execute(
      { method: 'GET', url: `${baseUrl}/slow` },
      { toolCallId: 't8', messages: [] },
    );
    expect(result).toContain('Error [http-request]');
    expect(result).toContain('timed out');
    expect(result).toContain('100ms');
  });
});
