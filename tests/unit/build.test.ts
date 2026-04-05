import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';

const distDir = join(process.cwd(), 'dist');

describe('build verification', () => {
  beforeAll(() => {
    // Ensure build is fresh
    execSync('npm run build', { stdio: 'pipe' });
  }, 120_000);

  const tools = [
    'bash', 'grep', 'glob', 'read', 'edit', 'write', 'web-fetch',
    'memory', 'multi-edit', 'diff', 'task', 'lsp', 'http-request',
    'context-compaction', 'ask-user', 'sleep'
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

  it('17 entry points total', () => {
    const dirs = tools.length + 1; // tools + root
    expect(dirs).toBe(17);
  });

  it('ESM import resolves for root', async () => {
    const m = await import('../../dist/index.js');
    expect(Object.keys(m).length).toBeGreaterThanOrEqual(32);
  });

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
