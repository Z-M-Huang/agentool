import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMultiEdit, multiEdit } from '../../src/multi-edit/index.js';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('multi-edit tool', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `multi-edit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    testFile = join(testDir, 'test.txt');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(multiEdit).toBeDefined();
      expect(typeof multiEdit.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof multiEdit.description).toBe('string');
      expect(multiEdit.description.length).toBeGreaterThan(0);
    });

    it('has an input schema defined', () => {
      expect(multiEdit.inputSchema).toBeDefined();
    });
  });

  describe('apply 2 edits successfully', () => {
    it('replaces both strings and writes the result', async () => {
      await writeFile(testFile, 'hello world\ngoodbye world\n');
      const tool = createMultiEdit({ cwd: testDir });

      const result = await tool.execute(
        {
          file_path: 'test.txt',
          edits: [
            { old_string: 'hello', new_string: 'hi' },
            { old_string: 'goodbye', new_string: 'farewell' },
          ],
        },
        toolOpts,
      );

      expect(result).toContain('Successfully applied 2 edits');
      const content = await readFile(testFile, 'utf-8');
      expect(content).toBe('hi world\nfarewell world\n');
    });
  });

  describe('rollback on failure', () => {
    it('does not write when the second edit fails', async () => {
      const original = 'alpha beta\ngamma delta\n';
      await writeFile(testFile, original);
      const tool = createMultiEdit({ cwd: testDir });

      const result = await tool.execute(
        {
          file_path: 'test.txt',
          edits: [
            { old_string: 'alpha', new_string: 'ALPHA' },
            { old_string: 'nonexistent', new_string: 'replacement' },
          ],
        },
        toolOpts,
      );

      expect(result).toContain('Edit 2/2 failed');
      expect(result).toContain('not found');
      expect(result).toContain('No edits were applied');

      // File must be unchanged
      const content = await readFile(testFile, 'utf-8');
      expect(content).toBe(original);
    });
  });

  describe('empty edits array', () => {
    it('returns a message about no edits and leaves the file unchanged', async () => {
      const original = 'untouched content\n';
      await writeFile(testFile, original);
      const tool = createMultiEdit({ cwd: testDir });

      const result = await tool.execute(
        { file_path: 'test.txt', edits: [] },
        toolOpts,
      );

      expect(result).toContain('No edits provided');
      const content = await readFile(testFile, 'utf-8');
      expect(content).toBe(original);
    });
  });

  describe('non-unique old_string error', () => {
    it('rejects when old_string appears more than once', async () => {
      await writeFile(testFile, 'dup dup dup\n');
      const tool = createMultiEdit({ cwd: testDir });

      const result = await tool.execute(
        {
          file_path: 'test.txt',
          edits: [{ old_string: 'dup', new_string: 'unique' }],
        },
        toolOpts,
      );

      expect(result).toContain('Edit 1/1 failed');
      expect(result).toContain('matches 3 locations');
      expect(result).toContain('must be unique');
      expect(result).toContain('No edits were applied');

      // File must be unchanged
      const content = await readFile(testFile, 'utf-8');
      expect(content).toBe('dup dup dup\n');
    });
  });

  describe('file not found', () => {
    it('returns an error when the file does not exist', async () => {
      const tool = createMultiEdit({ cwd: testDir });

      const result = await tool.execute(
        {
          file_path: 'nonexistent.txt',
          edits: [{ old_string: 'a', new_string: 'b' }],
        },
        toolOpts,
      );

      expect(result).toContain('Error [multi-edit]:');
    });
  });

  describe('sequential edit dependency', () => {
    it('applies edits in order so later edits see earlier changes', async () => {
      await writeFile(testFile, 'foo bar\n');
      const tool = createMultiEdit({ cwd: testDir });

      // First edit changes foo to baz, second edit changes baz to qux
      const result = await tool.execute(
        {
          file_path: 'test.txt',
          edits: [
            { old_string: 'foo', new_string: 'baz' },
            { old_string: 'baz', new_string: 'qux' },
          ],
        },
        toolOpts,
      );

      expect(result).toContain('Successfully applied 2 edits');
      const content = await readFile(testFile, 'utf-8');
      expect(content).toBe('qux bar\n');
    });
  });

  describe('single edit singular message', () => {
    it('uses singular "edit" for a single edit', async () => {
      await writeFile(testFile, 'only one\n');
      const tool = createMultiEdit({ cwd: testDir });

      const result = await tool.execute(
        {
          file_path: 'test.txt',
          edits: [{ old_string: 'only one', new_string: 'just one' }],
        },
        toolOpts,
      );

      expect(result).toContain('Successfully applied 1 edit ');
    });
  });

  describe('curly quote fallback in multi-edit', () => {
    it('matches curly quotes and preserves style', async () => {
      await writeFile(testFile, 'say \u201Chello\u201D world\n');
      const tool = createMultiEdit({ cwd: testDir });

      const result = await tool.execute(
        {
          file_path: 'test.txt',
          edits: [{ old_string: 'say "hello"', new_string: 'say "bye"' }],
        },
        toolOpts,
      );

      expect(result).toContain('Successfully applied 1 edit');
      const content = await readFile(testFile, 'utf-8');
      expect(content).toContain('\u201C');
      expect(content).toContain('bye');
    });
  });
});
