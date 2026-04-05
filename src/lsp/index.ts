import { tool } from 'ai';
import { z } from 'zod';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import type { BaseToolConfig } from '../shared/types.js';

export interface LspServerConfig { command: string; args?: string[] }

export interface LspConfig extends BaseToolConfig {
  servers?: Record<string, LspServerConfig>;
  timeout?: number;
}

let nextId = 1;

function encodeJsonRpc(msg: object): Buffer {
  const body = JSON.stringify(msg);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function parseJsonRpcResponses(buffer: Buffer): object[] {
  const parsed: object[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n', offset);
    if (headerEnd === -1) break;
    const match = /Content-Length:\s*(\d+)/i.exec(buffer.subarray(offset, headerEnd).toString());
    if (!match) break;
    const bodyStart = headerEnd + 4;
    const contentLength = parseInt(match[1], 10);
    if (bodyStart + contentLength > buffer.length) break;
    try { parsed.push(JSON.parse(buffer.subarray(bodyStart, bodyStart + contentLength).toString())); } catch { /* skip */ }
    offset = bodyStart + contentLength;
  }
  return parsed;
}

interface LspRequest {
  operation: string; filePath: string; line?: number;
  character?: number; cwd: string;
}

function operationToMethod(operation: string): string {
  const map: Record<string, string> = {
    goToDefinition: 'textDocument/definition',
    findReferences: 'textDocument/references',
    hover: 'textDocument/hover',
    documentSymbol: 'textDocument/documentSymbol',
    workspaceSymbol: 'workspace/symbol',
    goToImplementation: 'textDocument/implementation',
    prepareCallHierarchy: 'textDocument/prepareCallHierarchy',
    incomingCalls: 'textDocument/prepareCallHierarchy',
    outgoingCalls: 'textDocument/prepareCallHierarchy',
  };
  return map[operation] ?? operation;
}

function buildRequestParams(op: string, uri: string, line: number, char: number): object {
  if (op === 'workspaceSymbol') return { query: '' };
  const td = { uri };
  if (op === 'documentSymbol') return { textDocument: td };
  const pos = { line, character: char };
  if (op === 'findReferences') return { textDocument: td, position: pos, context: { includeDeclaration: true } };
  return { textDocument: td, position: pos };
}

function sendRequest(proc: ChildProcess, method: string, params: object): number {
  const id = nextId++;
  const msg = { jsonrpc: '2.0', id, method, params };
  proc.stdin!.write(encodeJsonRpc(msg));
  return id;
}

function sendNotification(proc: ChildProcess, method: string, params: object): void {
  const msg = { jsonrpc: '2.0', method, params };
  proc.stdin!.write(encodeJsonRpc(msg));
}

type RpcResponse = { result?: unknown; error?: { code: number; message: string } };

function waitForResponse(proc: ChildProcess, id: number, timeoutMs: number): Promise<RpcResponse> {
  return new Promise((resolveP, reject) => {
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => { cleanup(); reject(new Error(`LSP request timed out after ${timeoutMs}ms`)); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); proc.stdout!.off('data', onData); proc.stdout!.off('error', onErr); };
    function onData(chunk: Buffer) {
      buf = Buffer.concat([buf, chunk]);
      for (const msg of parseJsonRpcResponses(buf)) {
        const rpc = msg as Record<string, unknown>;
        if (rpc.id === id) {
          cleanup();
          resolveP(rpc.error ? { error: rpc.error as RpcResponse['error'] } : { result: rpc.result });
          return;
        }
      }
    }
    function onErr(e: Error) { cleanup(); reject(e); }
    proc.stdout!.on('data', onData);
    proc.stdout!.on('error', onErr);
  });
}

async function shutdownServer(proc: ChildProcess, ms: number): Promise<void> {
  try {
    const id = sendRequest(proc, 'shutdown', {});
    await waitForResponse(proc, id, Math.min(ms, 5000));
    sendNotification(proc, 'exit', {});
  } catch { /* best-effort */ } finally { proc.kill(); }
}

export async function executeLspOperation(
  serverConfig: LspServerConfig,
  params: LspRequest,
  timeoutMs: number,
): Promise<string> {
  const absolutePath = resolve(params.cwd, params.filePath);
  const uri = pathToFileURL(absolutePath).href;
  // spawn does not use a shell -- safe from injection
  const proc = spawn(serverConfig.command, serverConfig.args ?? [], {
    cwd: params.cwd, stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Wrap spawn error into a promise so we can race it against requests
  const spawnError = new Promise<never>((_, reject) => {
    proc.on('error', (err) => reject(err));
  });

  try {
    const initId = sendRequest(proc, 'initialize', {
      processId: process.pid, capabilities: {}, rootUri: pathToFileURL(params.cwd).href,
    });
    const rpc = (id: number) => Promise.race([waitForResponse(proc, id, timeoutMs), spawnError]);
    await rpc(initId);
    sendNotification(proc, 'initialized', {});

    const content = await readFile(absolutePath, 'utf-8');
    const langId = extname(absolutePath).replace('.', '') || 'plaintext';
    sendNotification(proc, 'textDocument/didOpen', {
      textDocument: { uri, languageId: langId, version: 1, text: content },
    });

    const method = operationToMethod(params.operation);
    const reqParams = buildRequestParams(params.operation, uri, params.line ?? 0, params.character ?? 0);
    let response = await rpc(sendRequest(proc, method, reqParams));
    if (response.error) return `Error [lsp]: Server error: ${response.error.message} (code ${response.error.code})`;

    if ((params.operation === 'incomingCalls' || params.operation === 'outgoingCalls')
      && Array.isArray(response.result) && response.result.length > 0) {
      const cm = params.operation === 'incomingCalls' ? 'callHierarchy/incomingCalls' : 'callHierarchy/outgoingCalls';
      response = await rpc(sendRequest(proc, cm, { item: response.result[0] }));
      if (response.error) return `Error [lsp]: Server error: ${response.error.message} (code ${response.error.code})`;
    }

    await shutdownServer(proc, timeoutMs);
    return JSON.stringify(response.result, null, 2) ?? 'null';
  } catch (error) {
    proc.kill();
    throw error;
  }
}

const LSP_OPERATIONS = [
  'goToDefinition', 'findReferences', 'hover', 'documentSymbol',
  'workspaceSymbol', 'goToImplementation', 'prepareCallHierarchy',
  'incomingCalls', 'outgoingCalls',
] as const;

/** Creates an LSP tool that performs language server operations. */
export function createLsp(config: LspConfig = {}) {
  const timeoutMs = config.timeout ?? 30_000;

  return tool({
    description:
      'Perform language server operations like go-to-definition, find-references, ' +
      'and hover. Requires LSP server configuration. Supports 9 operations: ' +
      'goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, ' +
      'goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls.',
    inputSchema: z.object({
      operation: z.enum(LSP_OPERATIONS).describe('The LSP operation to perform'),
      filePath: z.string().describe('Path to the file'),
      line: z.number().int().positive().describe('The line number (1-based, as shown in editors)'),
      character: z.number().int().positive().describe('The character offset (1-based, as shown in editors)'),
    }),
    execute: async ({ operation, filePath, line, character }) => {
      if (!config.servers || Object.keys(config.servers).length === 0) {
        return (
          'Error [lsp]: No LSP servers configured. Provide server configuration ' +
          'via createLsp({ servers: { ".ts": { command: "typescript-language-server",' +
          ' args: ["--stdio"] } } })'
        );
      }

      const ext = extname(filePath) || ('.' + filePath.split('.').pop());
      const serverConfig = config.servers[ext];
      if (!serverConfig) {
        const available = Object.keys(config.servers).join(', ');
        return `Error [lsp]: No LSP server configured for ${ext} files. Available: ${available}`;
      }

      try {
        // Convert 1-based (user-facing) to 0-based (LSP protocol) at the tool boundary
        return await executeLspOperation(
          serverConfig,
          { operation, filePath, line: line - 1, character: character - 1, cwd: config.cwd ?? process.cwd() },
          timeoutMs,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [lsp]: ${operation} failed for ${filePath}: ${msg}`;
      }
    },
  });
}

/** Default LSP tool instance with no servers configured. */
export const lsp = createLsp();
