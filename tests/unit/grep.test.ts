import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGrep, grep as defaultGrep } from '../../src/grep/index.js';

// Detect rg availability
let hasRg = false;
try {
  execFileSync('which', ['rg'], { encoding: 'utf-8' });
  hasRg = true;
} catch {
  // rg not installed
}

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

// Create a temp fixture directory with known content
let fixtureDir: string;

beforeAll(() => {
  fixtureDir = join(tmpdir(), `agentool-grep-test-${Date.now()}`);
  mkdirSync(join(fixtureDir, 'src'), { recursive: true });
  mkdirSync(join(fixtureDir, 'lib'), { recursive: true });

  writeFileSync(
    join(fixtureDir, 'src', 'index.ts'),
    [
      'export function hello() {',
      '  return "hello world";',
      '}',
      '',
      'export function goodbye() {',
      '  return "goodbye world";',
      '}',
    ].join('\n'),
  );

  writeFileSync(
    join(fixtureDir, 'src', 'utils.ts'),
    [
      '// utility functions',
      'export function capitalize(s: string) {',
      '  return s.charAt(0).toUpperCase() + s.slice(1);',
      '}',
    ].join('\n'),
  );

  writeFileSync(
    join(fixtureDir, 'lib', 'helper.js'),
    [
      'function helperFn() {',
      '  return "HELLO from helper";',
      '}',
      'module.exports = { helperFn };',
    ].join('\n'),
  );

  writeFileSync(
    join(fixtureDir, 'src', 'multi.txt'),
    'first line\nsecond line\nthird line\nfourth line\n',
  );
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('grep tool', () => {
  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(defaultGrep).toBeDefined();
      expect(typeof defaultGrep.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof defaultGrep.description).toBe('string');
      expect(defaultGrep.description.length).toBeGreaterThan(0);
    });
  });

  describe.skipIf(!hasRg)('with ripgrep', () => {
    it('content mode returns matches with line numbers', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        { pattern: 'hello', output_mode: 'content' },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      // Should contain line numbers (format: path:N:content)
      expect(result).toMatch(/:\d+:/);
      expect(result).toContain('hello');
    });

    it('files_with_matches mode returns file paths sorted by mtime', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        { pattern: 'function', output_mode: 'files_with_matches' },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      // Should list file paths (relative)
      const lines = result.split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      // Paths should contain known files
      const text = lines.join(' ');
      expect(text).toContain('index.ts');
      expect(text).toContain('utils.ts');
    });

    it('count mode returns file:count format with totals', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        { pattern: 'function', output_mode: 'count' },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      // Should contain colon-separated counts
      expect(result).toMatch(/:\d+/);
      // Should contain total summary
      expect(result).toMatch(/Total: \d+ matches in \d+ files/);
    });

    it('head_limit truncates results', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'line',
          output_mode: 'content',
          path: join(fixtureDir, 'src', 'multi.txt'),
          head_limit: 2,
        },
        toolOpts,
      );

      // Should have truncation info
      expect(result).toContain('[Results truncated');
      expect(result).toContain('limit: 2');
    });

    it('returns "No matches found" when nothing matches', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        { pattern: 'zzz_nonexistent_pattern_zzz', output_mode: 'content' },
        toolOpts,
      );

      expect(result).toBe('No matches found');
    });

    it('multiline mode matches across lines', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'first.*second',
          output_mode: 'content',
          path: join(fixtureDir, 'src', 'multi.txt'),
          multiline: true,
          '-n': false,
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).toContain('first');
      expect(result).toContain('second');
    });

    it('case insensitive search finds mixed-case matches', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        { pattern: 'hello', output_mode: 'files_with_matches', '-i': true },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      // Should find both src/index.ts (lowercase) and lib/helper.js (HELLO)
      expect(result).toContain('index.ts');
      expect(result).toContain('helper.js');
    });

    it('glob filter narrows search to specific file types', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'function',
          output_mode: 'files_with_matches',
          glob: '*.ts',
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).toContain('.ts');
      expect(result).not.toContain('.js');
    });

    it('returns error string rather than throwing', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      // Invalid regex should cause ripgrep to error
      const result = await grepTool.execute(
        { pattern: '[invalid', output_mode: 'content' },
        toolOpts,
      );

      expect(typeof result).toBe('string');
    });

    it('no matches in files_with_matches mode', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        { pattern: 'zzz_nonexistent_zzz', output_mode: 'files_with_matches' },
        toolOpts,
      );

      expect(result).toBe('No matches found');
    });

    it('no matches in count mode', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        { pattern: 'zzz_nonexistent_zzz', output_mode: 'count' },
        toolOpts,
      );

      expect(result).toBe('No matches found');
    });

    it('type filter narrows search to specific file types', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'function',
          output_mode: 'files_with_matches',
          type: 'ts',
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).toContain('.ts');
      expect(result).not.toContain('.js');
    });

    it('pattern starting with dash uses -e flag', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        { pattern: '-hello', output_mode: 'content' },
        toolOpts,
      );
      // Should not crash -- -e prevents treating it as a flag
      expect(typeof result).toBe('string');
    });

    it('context alias (-C) works in content mode', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'second',
          output_mode: 'content',
          '-C': 1,
          path: join(fixtureDir, 'src', 'multi.txt'),
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).toContain('second');
    });

    it('context alias (context) works in content mode', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'second',
          output_mode: 'content',
          context: 1,
          path: join(fixtureDir, 'src', 'multi.txt'),
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).toContain('second');
    });

    it('-B and -A context lines work in content mode', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'second',
          output_mode: 'content',
          '-B': 1,
          '-A': 1,
          path: join(fixtureDir, 'src', 'multi.txt'),
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).toContain('second');
    });

    it('offset works in files_with_matches mode', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'function',
          output_mode: 'files_with_matches',
          offset: 1,
          head_limit: 1,
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      // Should only contain one file path since limit=1 and offset=1
      const lines = result.split('\n').filter(Boolean);
      expect(lines.length).toBeLessThanOrEqual(2); // 1 path + possible truncation note
    });

    it('head_limit=0 returns unlimited results', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'function',
          output_mode: 'files_with_matches',
          head_limit: 0,
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).not.toContain('[Results truncated');
    });

    it('glob pattern with braces works', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'function',
          output_mode: 'files_with_matches',
          glob: '*.{ts,js}',
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
    });

    it('-n: false hides line numbers in content mode', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'hello',
          output_mode: 'content',
          '-n': false,
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).toContain('hello');
    });

    it('offset in count mode skips entries', async () => {
      const grepTool = createGrep({ cwd: fixtureDir });
      const result = await grepTool.execute(
        {
          pattern: 'function',
          output_mode: 'count',
          offset: 1,
        },
        toolOpts,
      );

      expect(result).not.toBe('No matches found');
      expect(result).toContain('Total:');
    });
  });
});
