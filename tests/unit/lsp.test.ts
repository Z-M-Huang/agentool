import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLsp, lsp, type LspServerConfig, executeLspOperation } from '../../src/lsp/index.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const toolCtx = { toolCallId: 'test', messages: [] as [] };

const MOCK_LSP_SERVER = resolve(import.meta.dirname, '../fixtures/mock-lsp-server.mjs');
const MOCK_LSP_ERROR_SERVER = resolve(import.meta.dirname, '../fixtures/mock-lsp-error-server.mjs');
let testCwd: string;

describe('lsp tool', () => {
  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(lsp).toBeDefined();
      expect(typeof lsp.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof lsp.description).toBe('string');
      expect(lsp.description.length).toBeGreaterThan(0);
    });

    it('has inputSchema defined', () => {
      expect('inputSchema' in lsp).toBe(true);
    });
  });

  describe('no servers configured', () => {
    it('returns error string when no servers are configured', async () => {
      const result = await lsp.execute(
        { operation: 'hover', filePath: 'test.ts', line: 1, character: 1 },
        toolCtx,
      );
      expect(result).toContain('Error [lsp]');
      expect(result).toContain('No LSP servers configured');
    });

    it('returns error when servers map is empty', async () => {
      const t = createLsp({ servers: {} });
      const result = await t.execute(
        { operation: 'goToDefinition', filePath: 'test.ts', line: 1, character: 1 },
        toolCtx,
      );
      expect(result).toContain('Error [lsp]');
      expect(result).toContain('No LSP servers configured');
    });
  });

  describe('unknown file extension', () => {
    it('returns error for unconfigured file extension', async () => {
      const t = createLsp({
        servers: { '.py': { command: 'pylsp' } },
      });
      const result = await t.execute(
        { operation: 'hover', filePath: 'test.ts', line: 1, character: 1 },
        toolCtx,
      );
      expect(result).toContain('Error [lsp]');
      expect(result).toContain('No LSP server configured for .ts files');
      expect(result).toContain('.py');
    });
  });

  describe('prepareCallHierarchy operation', () => {
    it('accepts prepareCallHierarchy as a valid operation', async () => {
      const result = await lsp.execute(
        { operation: 'prepareCallHierarchy', filePath: 'test.ts', line: 1, character: 1 },
        toolCtx,
      );
      expect(result).toContain('Error [lsp]');
      expect(result).toContain('No LSP servers configured');
    });
  });

  describe('createLsp factory', () => {
    it('creates tool with execute function', () => {
      const t = createLsp({
        servers: { '.ts': { command: 'typescript-language-server', args: ['--stdio'] } },
      });
      expect(t).toBeDefined();
      expect(typeof t.execute).toBe('function');
      expect(typeof t.description).toBe('string');
    });

    it('accepts empty config', () => {
      const t = createLsp();
      expect(t).toBeDefined();
      expect(typeof t.execute).toBe('function');
    });
  });

  describe('operation enum', () => {
    const operations = [
      'goToDefinition', 'findReferences', 'hover', 'documentSymbol',
      'workspaceSymbol', 'goToImplementation', 'prepareCallHierarchy',
      'incomingCalls', 'outgoingCalls',
    ] as const;

    for (const op of operations) {
      it(`accepts operation "${op}" without schema error`, async () => {
        // With no servers, each operation should hit the "no servers" error,
        // not a schema validation error.
        const result = await lsp.execute(
          { operation: op, filePath: 'test.ts', line: 1, character: 1 },
          toolCtx,
        );
        expect(result).toContain('Error [lsp]');
        expect(result).toContain('No LSP servers configured');
      });
    }
  });

  describe('spawn failure', () => {
    it('returns error when server command does not exist', async () => {
      const t = createLsp({
        servers: { '.ts': { command: 'nonexistent-lsp-server-binary-xyz' } },
        timeout: 3000,
      });
      const result = await t.execute(
        { operation: 'hover', filePath: 'test.ts', line: 1, character: 1 },
        toolCtx,
      );
      expect(result).toContain('Error [lsp]');
      expect(result).toContain('hover failed for test.ts');
    }, 10000);
  });

  describe('executeLspOperation spawn error', () => {
    it('throws when server binary does not exist', async () => {
      const serverConfig: LspServerConfig = { command: 'nonexistent-lsp-xyz', args: [] };
      await expect(
        executeLspOperation(serverConfig, {
          operation: 'hover', filePath: 'test.ts', line: 0, character: 0, cwd: '/tmp',
        }, 2000),
      ).rejects.toThrow();
    }, 10000);

    it('handles all operation types in the tool factory error path', async () => {
      const t = createLsp({
        servers: { '.ts': { command: 'nonexistent-lsp-xyz' } },
        timeout: 2000,
      });
      for (const op of ['goToDefinition', 'findReferences', 'documentSymbol', 'workspaceSymbol', 'goToImplementation', 'prepareCallHierarchy', 'incomingCalls', 'outgoingCalls'] as const) {
        const result = await t.execute(
          { operation: op, filePath: 'test.ts', line: 1, character: 1 },
          toolCtx,
        );
        expect(result).toContain('Error [lsp]');
      }
    }, 30000);
  });

  describe('file extension resolution', () => {
    it('handles file without extension', async () => {
      const t = createLsp({
        servers: { '.ts': { command: 'ts-server' } },
      });
      const result = await t.execute(
        { operation: 'hover', filePath: 'Makefile', line: 1, character: 1 },
        toolCtx,
      );
      // "Makefile" has no ext, so extname returns '' and fallback is '.Makefile'
      // which is not configured -- should give "No LSP server configured"
      expect(result).toContain('Error [lsp]');
    });
  });

  describe('executeLspOperation with mock server', () => {
    beforeAll(() => {
      testCwd = join(tmpdir(), `lsp-test-${Date.now()}`);
      mkdirSync(testCwd, { recursive: true });
      writeFileSync(join(testCwd, 'test.ts'), 'const x = 1;\n');
    });

    afterAll(() => {
      rmSync(testCwd, { recursive: true, force: true });
    });

    it('performs hover operation via JSON-RPC', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'hover', filePath: 'test.ts', line: 0, character: 0, cwd: testCwd,
      }, 10000);
      expect(result).toContain('mock hover result');
    }, 15000);

    it('performs goToDefinition operation via JSON-RPC', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'goToDefinition', filePath: 'test.ts', line: 0, character: 0, cwd: testCwd,
      }, 10000);
      expect(result).toContain('file:///mock.ts');
    }, 15000);

    it('performs findReferences operation via JSON-RPC', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'findReferences', filePath: 'test.ts', line: 0, character: 0, cwd: testCwd,
      }, 10000);
      expect(result).toBeDefined();
    }, 15000);

    it('performs documentSymbol operation via JSON-RPC', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'documentSymbol', filePath: 'test.ts', cwd: testCwd,
      }, 10000);
      expect(result).toBeDefined();
    }, 15000);

    it('performs workspaceSymbol operation via JSON-RPC', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'workspaceSymbol', filePath: 'test.ts', cwd: testCwd,
      }, 10000);
      expect(result).toBeDefined();
    }, 15000);

    it('performs goToImplementation operation via JSON-RPC', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'goToImplementation', filePath: 'test.ts', line: 0, character: 0, cwd: testCwd,
      }, 10000);
      expect(result).toBeDefined();
    }, 15000);

    it('passes unknown operation strings through as JSON-RPC methods', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'custom/method', filePath: 'test.ts', line: 0, character: 0, cwd: testCwd,
      }, 10000);
      expect(result).toBe('null');
    }, 15000);

    it('performs incomingCalls via prepareCallHierarchy + callHierarchy/incomingCalls', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'incomingCalls', filePath: 'test.ts', line: 0, character: 0, cwd: testCwd,
      }, 10000);
      expect(result).toBeDefined();
    }, 15000);

    it('performs outgoingCalls via prepareCallHierarchy + callHierarchy/outgoingCalls', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'outgoingCalls', filePath: 'test.ts', line: 0, character: 0, cwd: testCwd,
      }, 10000);
      expect(result).toBeDefined();
    }, 15000);

    it('createLsp with mock server performs full hover via tool.execute', async () => {
      const t = createLsp({
        servers: { '.ts': { command: process.execPath, args: [MOCK_LSP_SERVER] } },
        timeout: 10000,
        cwd: testCwd,
      });
      const result = await t.execute(
        { operation: 'hover', filePath: 'test.ts', line: 1, character: 1 },
        toolCtx,
      );
      expect(result).toContain('mock hover result');
    }, 15000);
  });

  describe('executeLspOperation error responses', () => {
    let errCwd: string;

    beforeAll(() => {
      errCwd = join(tmpdir(), `lsp-test-err-${Date.now()}`);
      mkdirSync(errCwd, { recursive: true });
      writeFileSync(join(errCwd, 'test.ts'), 'const x = 1;\n');
    });

    afterAll(() => {
      rmSync(errCwd, { recursive: true, force: true });
    });

    it('returns error string when server returns an error response', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_ERROR_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'hover', filePath: 'test.ts', line: 0, character: 0, cwd: errCwd,
      }, 10000);
      expect(result).toContain('Error [lsp]');
      expect(result).toContain('Mock server error');
    }, 15000);

    it('returns error for call hierarchy error response', async () => {
      const serverConfig: LspServerConfig = { command: process.execPath, args: [MOCK_LSP_ERROR_SERVER] };
      const result = await executeLspOperation(serverConfig, {
        operation: 'incomingCalls', filePath: 'test.ts', line: 0, character: 0, cwd: errCwd,
      }, 10000);
      expect(result).toContain('Error [lsp]');
      expect(result).toContain('Call hierarchy error');
    }, 15000);
  });

  describe('executeLspOperation with extensionless file', () => {
    let extCwd: string;

    beforeAll(() => {
      extCwd = join(tmpdir(), `lsp-test-ext-${Date.now()}`);
      mkdirSync(extCwd, { recursive: true });
      writeFileSync(join(extCwd, 'Makefile'), 'all: build\n');
    });

    afterAll(() => {
      rmSync(extCwd, { recursive: true, force: true });
    });

    it('uses plaintext languageId for extensionless files', async () => {
      const t = createLsp({
        servers: { '.Makefile': { command: process.execPath, args: [MOCK_LSP_SERVER] } },
        timeout: 10000,
        cwd: extCwd,
      });
      const result = await t.execute(
        { operation: 'hover', filePath: 'Makefile', line: 1, character: 1 },
        toolCtx,
      );
      // Should succeed with mock server
      expect(result).toContain('mock hover result');
    }, 15000);
  });
});
