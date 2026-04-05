import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGlob, glob as defaultGlob } from '../../src/glob/index.js';

// Detect rg availability
let hasRg = false;
try {
  execFileSync('which', ['rg'], { encoding: 'utf-8' });
  hasRg = true;
} catch {
  // rg not installed
}

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

// Create a temp fixture directory with known files
let fixtureDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `agentool-glob-test-${Date.now()}`);
  mkdirSync(join(fixtureDir, 'src'), { recursive: true });
  mkdirSync(join(fixtureDir, 'lib'), { recursive: true });
  writeFileSync(join(fixtureDir, 'src', 'index.ts'), 'export {};');
  writeFileSync(join(fixtureDir, 'src', 'utils.ts'), 'export {};');
  writeFileSync(join(fixtureDir, 'lib', 'helper.js'), 'module.exports = {};');
  writeFileSync(join(fixtureDir, 'README.md'), '# Test');
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('glob tool', () => {
  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(defaultGlob).toBeDefined();
      expect(typeof defaultGlob.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof defaultGlob.description).toBe('string');
      expect(defaultGlob.description.length).toBeGreaterThan(0);
    });
  });

  describe.skipIf(!hasRg)('with ripgrep', () => {
    it('finds .ts files and returns absolute paths', async () => {
      const globTool = createGlob({ cwd: fixtureDir });
      const result = await globTool.execute(
        { pattern: '**/*.ts' },
        toolOpts,
      );

      expect(result).toContain('Found 2 files');
      // Paths must be absolute
      const lines = result.split('\n').slice(1);
      for (const line of lines) {
        expect(line.startsWith('/')).toBe(true);
      }
      expect(result).toContain('index.ts');
      expect(result).toContain('utils.ts');
    });

    it('returns "No files found" for no matches', async () => {
      const globTool = createGlob({ cwd: fixtureDir });
      const result = await globTool.execute(
        { pattern: '**/*.xyz' },
        toolOpts,
      );

      expect(result).toBe('No files found');
    });

    it('searches in custom path parameter', async () => {
      const globTool = createGlob({ cwd: fixtureDir });
      const result = await globTool.execute(
        { pattern: '*.js', path: join(fixtureDir, 'lib') },
        toolOpts,
      );

      expect(result).toContain('Found 1 files');
      expect(result).toContain('helper.js');
    });

    it('finds files with different extensions', async () => {
      const globTool = createGlob({ cwd: fixtureDir });
      const result = await globTool.execute(
        { pattern: '**/*.md' },
        toolOpts,
      );

      expect(result).toContain('Found 1 files');
      expect(result).toContain('README.md');
    });

    it('returns error string on invalid path', async () => {
      const globTool = createGlob({ cwd: '/nonexistent/path/xyz' });
      const result = await globTool.execute(
        { pattern: '**/*.ts' },
        toolOpts,
      );

      // Should return an error string, not throw
      expect(typeof result).toBe('string');
      expect(result).toMatch(/Error|No files found/);
    });

    it('reports truncated results when many files exist', async () => {
      // Create >100 files to trigger truncation in glob (default limit is 100)
      const manyDir = join(fixtureDir, 'many');
      mkdirSync(manyDir, { recursive: true });
      for (let i = 0; i < 105; i++) {
        writeFileSync(join(manyDir, `file-${String(i).padStart(3, '0')}.dat`), `content-${i}`);
      }

      const globTool = createGlob({ cwd: manyDir });
      const result = await globTool.execute(
        { pattern: '**/*.dat' },
        toolOpts,
      );

      expect(result).toContain('results truncated');
    });
  });
});
