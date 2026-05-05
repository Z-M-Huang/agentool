import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const distDir = join(process.cwd(), 'dist');
const execFileAsync = promisify(execFile);

describe('build verification', () => {
  beforeAll(async () => {
    // Ensure build is fresh
    await execFileAsync('npm', ['run', 'build'], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });
  }, 120_000);

  const tools = [
    'bash', 'grep', 'glob', 'read', 'edit', 'write', 'web-fetch',
    'memory', 'multi-edit', 'diff', 'task-create', 'task-get',
    'task-update', 'task-list', 'web-search', 'tool-search',
    'lsp', 'http-request', 'output-validator', 'context-compaction',
    'ask-user', 'sleep'
  ];

  it('root entry point has ESM, CJS, and DTS', () => {
    expect(existsSync(join(distDir, 'index.js'))).toBe(true);
    expect(existsSync(join(distDir, 'index.cjs'))).toBe(true);
    expect(existsSync(join(distDir, 'index.d.ts'))).toBe(true);
  });

  for (const tool of tools) {
    it(`${tool} has ESM, CJS, and DTS`, () => {
      expect(existsSync(join(distDir, tool, 'index.js'))).toBe(true);
      expect(existsSync(join(distDir, tool, 'index.cjs'))).toBe(true);
      expect(existsSync(join(distDir, tool, 'index.d.ts'))).toBe(true);
    });
  }

  it('23 entry points total', () => {
    const dirs = tools.length + 1; // tools + root
    expect(dirs).toBe(23);
  });

  it('ESM import resolves for root', async () => {
    const m = await import('../../dist/index.js');
    expect(Object.keys(m).length).toBeGreaterThanOrEqual(32);
  }, 10_000);

  it('ai and zod not bundled in dist', () => {
    // Check that dist doesn't contain ai/zod code
    const indexContent = require('fs').readFileSync(join(distDir, 'index.js'), 'utf8');
    expect(indexContent).not.toContain('class AISDKError');
    expect(indexContent).not.toContain('ZodType');
  });

  it('subpath exports resolve', async () => {
    const grep = await import('../../dist/grep/index.js');
    expect(grep.createGrep).toBeDefined();
    expect(grep.grep).toBeDefined();
  });
});
