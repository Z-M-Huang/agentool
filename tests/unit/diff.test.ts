import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDiff, diff } from '../../src/diff/index.js';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('diff tool', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `diff-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(diff).toBeDefined();
      expect(typeof diff.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof diff.description).toBe('string');
      expect(diff.description.length).toBeGreaterThan(0);
    });

    it('has an input schema defined', () => {
      expect(diff.inputSchema).toBeDefined();
    });
  });

  describe('diff two files', () => {
    it('returns a unified diff between two files', async () => {
      const fileA = join(testDir, 'a.txt');
      const fileB = join(testDir, 'b.txt');
      await writeFile(fileA, 'line one\nline two\n');
      await writeFile(fileB, 'line one\nline THREE\n');

      const tool = createDiff({ cwd: testDir });
      const result = await tool.execute(
        { file_path: 'a.txt', other_file_path: 'b.txt' },
        toolOpts,
      );

      expect(result).toContain('---');
      expect(result).toContain('+++');
      expect(result).toContain('-line two');
      expect(result).toContain('+line THREE');
    });
  });

  describe('diff two strings', () => {
    it('returns a unified diff between old_content and new_content', async () => {
      const result = await diff.execute(
        {
          old_content: 'apple\nbanana\n',
          new_content: 'apple\ncherry\n',
        },
        toolOpts,
      );

      expect(result).toContain('---');
      expect(result).toContain('+++');
      expect(result).toContain('-banana');
      expect(result).toContain('+cherry');
    });
  });

  describe('identical content', () => {
    it('returns "No differences found." for identical strings', async () => {
      const result = await diff.execute(
        {
          old_content: 'same content\n',
          new_content: 'same content\n',
        },
        toolOpts,
      );

      expect(result).toBe('No differences found.');
    });

    it('returns "No differences found." for identical files', async () => {
      const fileA = join(testDir, 'same1.txt');
      const fileB = join(testDir, 'same2.txt');
      await writeFile(fileA, 'identical\n');
      await writeFile(fileB, 'identical\n');

      const tool = createDiff({ cwd: testDir });
      const result = await tool.execute(
        { file_path: 'same1.txt', other_file_path: 'same2.txt' },
        toolOpts,
      );

      expect(result).toBe('No differences found.');
    });
  });

  describe('error handling', () => {
    it('returns an error when a file does not exist', async () => {
      const tool = createDiff({ cwd: testDir });
      const result = await tool.execute(
        { file_path: 'nonexistent.txt', other_file_path: 'also-missing.txt' },
        toolOpts,
      );

      expect(result).toContain('Error [diff]:');
    });
  });

  describe('file path + new_content', () => {
    it('diffs a file against provided new_content', async () => {
      const file = join(testDir, 'original.txt');
      await writeFile(file, 'original line\n');

      const tool = createDiff({ cwd: testDir });
      const result = await tool.execute(
        { file_path: 'original.txt', new_content: 'modified line\n' },
        toolOpts,
      );

      expect(result).toContain('-original line');
      expect(result).toContain('+modified line');
    });
  });

  describe('insufficient parameters', () => {
    it('returns an error when no parameters are provided', async () => {
      const result = await diff.execute({}, toolOpts);

      expect(result).toContain('Error [diff]: Insufficient parameters');
    });
  });

  describe('file path + old_content', () => {
    it('diffs provided old_content against the file content', async () => {
      const file = join(testDir, 'existing.txt');
      await writeFile(file, 'current line\n');

      const tool = createDiff({ cwd: testDir });
      const result = await tool.execute(
        { file_path: 'existing.txt', old_content: 'original line\n' },
        toolOpts,
      );

      expect(result).toContain('-original line');
      expect(result).toContain('+current line');
    });
  });

  describe('error on missing file in mode 3', () => {
    it('returns error when file path + new_content and file missing', async () => {
      const tool = createDiff({ cwd: testDir });
      const result = await tool.execute(
        { file_path: 'nonexistent.txt', new_content: 'content\n' },
        toolOpts,
      );

      expect(result).toContain('Error [diff]:');
    });
  });
});
