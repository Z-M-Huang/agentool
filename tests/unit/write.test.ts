import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWrite, write } from '../../src/write/index.js';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('write tool', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'write-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(write).toBeDefined();
      expect(typeof write.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof write.description).toBe('string');
      expect(write.description.length).toBeGreaterThan(0);
    });

    it('has input schema defined', () => {
      expect(write.inputSchema).toBeDefined();
    });
  });

  describe('create new file in deep nested dir', () => {
    it('creates parent directories and file', async () => {
      const filePath = join(tempDir, 'a', 'b', 'c', 'deep.txt');
      const tool = createWrite({ cwd: tempDir });
      const result = await tool.execute(
        { file_path: filePath, content: 'deep content' },
        toolOpts,
      );

      expect(result).toContain('Created file:');
      expect(result).toContain(filePath);
      const written = await readFile(filePath, 'utf-8');
      expect(written).toBe('deep content');
    });
  });

  describe('update existing file', () => {
    it('reports update when the file already exists', async () => {
      const filePath = join(tempDir, 'existing.txt');
      await writeFile(filePath, 'old content', 'utf-8');

      const tool = createWrite({ cwd: tempDir });
      const result = await tool.execute(
        { file_path: filePath, content: 'new content' },
        toolOpts,
      );

      expect(result).toContain('Updated file:');
      expect(result).toContain(filePath);
    });
  });

  describe('create vs update reporting', () => {
    it('says Created for a new file', async () => {
      const filePath = join(tempDir, 'brand-new.txt');
      const tool = createWrite({ cwd: tempDir });
      const result = await tool.execute(
        { file_path: filePath, content: 'hello' },
        toolOpts,
      );

      expect(result).toMatch(/^Created file:/);
    });

    it('says Updated for an existing file', async () => {
      const filePath = join(tempDir, 'already-here.txt');
      await writeFile(filePath, 'original', 'utf-8');

      const tool = createWrite({ cwd: tempDir });
      const result = await tool.execute(
        { file_path: filePath, content: 'modified' },
        toolOpts,
      );

      expect(result).toMatch(/^Updated file:/);
    });
  });

  describe('overwrite replaces content (not append)', () => {
    it('fully replaces existing content', async () => {
      const filePath = join(tempDir, 'replace.txt');
      await writeFile(filePath, 'AAAA', 'utf-8');

      const tool = createWrite({ cwd: tempDir });
      await tool.execute(
        { file_path: filePath, content: 'BB' },
        toolOpts,
      );

      const written = await readFile(filePath, 'utf-8');
      expect(written).toBe('BB');
    });
  });

  describe('byte count', () => {
    it('includes byte count in the result', async () => {
      const filePath = join(tempDir, 'bytes.txt');
      const tool = createWrite({ cwd: tempDir });
      const result = await tool.execute(
        { file_path: filePath, content: 'hello' },
        toolOpts,
      );

      expect(result).toContain('(5 bytes)');
    });

    it('reports correct byte count for multi-byte characters', async () => {
      const filePath = join(tempDir, 'multibyte.txt');
      const content = '\u00e9\u00e8\u00ea'; // 3 chars, 6 bytes in utf-8
      const tool = createWrite({ cwd: tempDir });
      const result = await tool.execute(
        { file_path: filePath, content },
        toolOpts,
      );

      expect(result).toContain('(6 bytes)');
    });
  });

  describe('factory with custom cwd', () => {
    it('resolves relative paths against the configured cwd', async () => {
      const tool = createWrite({ cwd: tempDir });
      const result = await tool.execute(
        { file_path: 'relative.txt', content: 'relative content' },
        toolOpts,
      );

      expect(result).toContain('Created file:');
      expect(result).toContain(join(tempDir, 'relative.txt'));
      const written = await readFile(join(tempDir, 'relative.txt'), 'utf-8');
      expect(written).toBe('relative content');
    });
  });

  describe('error handling', () => {
    it('returns error string instead of throwing', async () => {
      // Writing to a path where a directory exists with the same name
      const dirPath = join(tempDir, 'is-a-dir');
      await mkdir(dirPath, { recursive: true });
      // Try to write to a file "inside" a path that would fail
      const filePath = join(dirPath, 'sub', 'file.txt');
      // This should succeed (mkdir -p behavior), so use an unwritable scenario:
      // Write to a path where a component is a file, not a dir
      const blockingFile = join(tempDir, 'blocker');
      await writeFile(blockingFile, 'x', 'utf-8');
      const badPath = join(blockingFile, 'child', 'file.txt');

      const tool = createWrite({ cwd: tempDir });
      const result = await tool.execute(
        { file_path: badPath, content: 'should fail' },
        toolOpts,
      );

      expect(result).toContain('Error [write]:');
      expect(result).toContain('Failed to write file');
    });
  });
});
