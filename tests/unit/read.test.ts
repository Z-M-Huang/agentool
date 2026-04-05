import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRead, read } from '../../src/read/index.js';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('read tool', () => {
  let tempDir: string;
  let testFile: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'read-test-'));
    testFile = join(tempDir, 'sample.txt');
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    await writeFile(testFile, lines.join('\n'), 'utf-8');
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('read full file with line numbers', () => {
    it('returns all lines in lineNum\\tcontent format', async () => {
      const result = await read.execute(
        { file_path: testFile },
        toolOpts,
      );
      expect(result).toContain('1\tline 1');
      expect(result).toContain('10\tline 10');
      const outputLines = result.split('\n');
      expect(outputLines).toHaveLength(10);
      expect(outputLines[0]).toBe('1\tline 1');
      expect(outputLines[4]).toBe('5\tline 5');
    });
  });

  describe('read with offset and limit', () => {
    it('returns the correct range with correct line numbers', async () => {
      const result = await read.execute(
        { file_path: testFile, offset: 2, limit: 3 },
        toolOpts,
      );
      const outputLines = result.split('\n');
      expect(outputLines).toHaveLength(3);
      expect(outputLines[0]).toBe('3\tline 3');
      expect(outputLines[1]).toBe('4\tline 4');
      expect(outputLines[2]).toBe('5\tline 5');
    });
  });

  describe('ENOENT error', () => {
    it('returns a descriptive error string for missing files', async () => {
      const result = await read.execute(
        { file_path: join(tempDir, 'nonexistent.txt') },
        toolOpts,
      );
      expect(result).toContain('Error [read]:');
      expect(result).toContain('ENOENT');
    });
  });

  describe('EISDIR error', () => {
    it('returns a descriptive error string for directories', async () => {
      const result = await read.execute(
        { file_path: tempDir },
        toolOpts,
      );
      expect(result).toContain('Error [read]:');
      expect(result).toContain('EISDIR');
    });
  });

  describe('createRead factory with custom cwd', () => {
    it('resolves relative paths against the configured cwd', async () => {
      const subDir = join(tempDir, 'sub');
      await mkdir(subDir, { recursive: true });
      const subFile = join(subDir, 'data.txt');
      await writeFile(subFile, 'hello\nworld', 'utf-8');

      const customRead = createRead({ cwd: subDir });
      const result = await customRead.execute(
        { file_path: 'data.txt' },
        toolOpts,
      );
      expect(result).toContain('1\thello');
      expect(result).toContain('2\tworld');
    });
  });

  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(read).toBeDefined();
      expect(typeof read.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof read.description).toBe('string');
      expect(read.description!.length).toBeGreaterThan(50);
    });

    it('has an input schema defined', () => {
      expect(read.inputSchema).toBeDefined();
    });
  });
});
