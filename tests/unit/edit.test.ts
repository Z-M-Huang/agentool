import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEdit, edit } from '../../src/edit/index.js';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('edit tool', () => {
  let tempDir: string;
  let tempFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'edit-test-'));
    tempFile = join(tempDir, 'test.txt');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(edit).toBeDefined();
      expect(typeof edit.execute).toBe('function');
    });
  });

  describe('exact match replacement', () => {
    it('replaces an exact match and writes the result', async () => {
      await writeFile(tempFile, 'hello world', 'utf-8');

      const result = await createEdit({ cwd: tempDir }).execute(
        { file_path: 'test.txt', old_string: 'hello', new_string: 'goodbye' },
        toolOpts,
      );

      expect(result).toContain('Successfully edited');
      expect(result).toContain('goodbye');

      const content = await readFile(tempFile, 'utf-8');
      expect(content).toBe('goodbye world');
    });
  });

  describe('curly quote fallback', () => {
    it('matches curly quotes in file when search uses straight quotes', async () => {
      // File has curly double quotes, search uses straight double quotes
      await writeFile(tempFile, 'say \u201Chello\u201D world', 'utf-8');

      const result = await createEdit({ cwd: tempDir }).execute(
        { file_path: 'test.txt', old_string: 'say "hello"', new_string: 'say "bye"' },
        toolOpts,
      );

      expect(result).toContain('Successfully edited');

      const content = await readFile(tempFile, 'utf-8');
      // The replacement should preserve curly quote style
      expect(content).toContain('\u201C');
      expect(content).toContain('bye');
    });
  });

  describe('non-unique error when not replace_all', () => {
    it('returns error when old_string appears more than once', async () => {
      await writeFile(tempFile, 'foo bar foo baz foo', 'utf-8');

      const result = await createEdit({ cwd: tempDir }).execute(
        { file_path: 'test.txt', old_string: 'foo', new_string: 'qux' },
        toolOpts,
      );

      expect(result).toContain('Error [edit]');
      expect(result).toContain('3 times');
      expect(result).toContain('replace_all');

      // File should be unchanged
      const content = await readFile(tempFile, 'utf-8');
      expect(content).toBe('foo bar foo baz foo');
    });
  });

  describe('not-found error', () => {
    it('returns error with file preview when old_string is absent', async () => {
      await writeFile(tempFile, 'alpha beta gamma', 'utf-8');

      const result = await createEdit({ cwd: tempDir }).execute(
        { file_path: 'test.txt', old_string: 'missing', new_string: 'found' },
        toolOpts,
      );

      expect(result).toContain('Error [edit]');
      expect(result).toContain('not found');
      expect(result).toContain('alpha beta gamma');
    });
  });

  describe('identical old/new error', () => {
    it('returns error when old_string and new_string are the same', async () => {
      await writeFile(tempFile, 'unchanged', 'utf-8');

      const result = await createEdit({ cwd: tempDir }).execute(
        { file_path: 'test.txt', old_string: 'unchanged', new_string: 'unchanged' },
        toolOpts,
      );

      expect(result).toContain('Error [edit]');
      expect(result).toContain('identical');
    });
  });

  describe('replace_all', () => {
    it('replaces all occurrences when replace_all is true', async () => {
      await writeFile(tempFile, 'aaa bbb aaa ccc aaa', 'utf-8');

      const result = await createEdit({ cwd: tempDir }).execute(
        { file_path: 'test.txt', old_string: 'aaa', new_string: 'zzz', replace_all: true },
        toolOpts,
      );

      expect(result).toContain('Successfully edited');

      const content = await readFile(tempFile, 'utf-8');
      expect(content).toBe('zzz bbb zzz ccc zzz');
    });
  });

  describe('factory with custom cwd', () => {
    it('resolves relative paths against the configured cwd', async () => {
      await writeFile(tempFile, 'original content', 'utf-8');

      const customEdit = createEdit({ cwd: tempDir });
      const result = await customEdit.execute(
        { file_path: 'test.txt', old_string: 'original', new_string: 'updated' },
        toolOpts,
      );

      expect(result).toContain('Successfully edited');

      const content = await readFile(tempFile, 'utf-8');
      expect(content).toBe('updated content');
    });
  });

  describe('file read error', () => {
    it('returns error when file cannot be read', async () => {
      const result = await createEdit({ cwd: tempDir }).execute(
        { file_path: 'nonexistent.txt', old_string: 'hello', new_string: 'bye' },
        toolOpts,
      );

      expect(result).toContain('Error [edit]');
      expect(result).toContain('Cannot read file');
    });
  });

  describe('deletion (empty new_string)', () => {
    it('reports deletion when new_string is empty', async () => {
      await writeFile(tempFile, 'remove this part and keep the rest', 'utf-8');

      const result = await createEdit({ cwd: tempDir }).execute(
        { file_path: 'test.txt', old_string: 'remove this part and ', new_string: '' },
        toolOpts,
      );

      expect(result).toContain('Successfully edited');
      expect(result).toContain('(deletion)');

      const content = await readFile(tempFile, 'utf-8');
      expect(content).toBe('keep the rest');
    });
  });
});
