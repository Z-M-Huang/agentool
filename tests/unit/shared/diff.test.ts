import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { diffStrings, diffFiles } from '../../../src/shared/diff.js';

describe('diffStrings', () => {
  it('produces a unified diff for different content', () => {
    const result = diffStrings('hello\n', 'hello world\n');

    expect(result).toContain('---');
    expect(result).toContain('+++');
    expect(result).toContain('-hello');
    expect(result).toContain('+hello world');
  });

  it('returns "No differences found." for identical content', () => {
    const result = diffStrings('same content\n', 'same content\n');

    expect(result).toBe('No differences found.');
  });

  it('respects custom context lines', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const oldContent = lines.join('\n') + '\n';
    const newLines = [...lines];
    newLines[10] = 'CHANGED LINE 11';
    const newContent = newLines.join('\n') + '\n';

    const withOneContext = diffStrings(oldContent, newContent, { context: 1 });
    const withFiveContext = diffStrings(oldContent, newContent, { context: 5 });

    // More context lines means a longer diff output
    expect(withFiveContext.length).toBeGreaterThan(withOneContext.length);

    // With context=1, lines far from the change should not appear
    expect(withOneContext).not.toContain('line 1\n');
    expect(withOneContext).toContain('line 11');

    // With context=5, more surrounding lines should appear
    expect(withFiveContext).toContain('line 6');
    expect(withFiveContext).toContain('line 16');
  });

  it('handles empty content on one or both sides', () => {
    const addResult = diffStrings('', 'new content\n');
    expect(addResult).toContain('+new content');

    const removeResult = diffStrings('old content\n', '');
    expect(removeResult).toContain('-old content');

    const bothEmpty = diffStrings('', '');
    expect(bothEmpty).toBe('No differences found.');
  });

  it('uses custom labels in the diff header', () => {
    const result = diffStrings('a\n', 'b\n', {
      oldLabel: 'original.txt',
      newLabel: 'modified.txt',
    });

    expect(result).toContain('original.txt');
    expect(result).toContain('modified.txt');
  });
});

describe('diffFiles', () => {
  it('produces a unified diff between two temp files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diff-test-'));
    const oldPath = join(dir, 'old.txt');
    const newPath = join(dir, 'new.txt');

    try {
      await writeFile(oldPath, 'line one\nline two\nline three\n', 'utf-8');
      await writeFile(newPath, 'line one\nline TWO\nline three\n', 'utf-8');

      const result = await diffFiles(oldPath, newPath);

      expect(result).toContain('---');
      expect(result).toContain('+++');
      expect(result).toContain('-line two');
      expect(result).toContain('+line TWO');
      // File paths appear as labels
      expect(result).toContain(oldPath);
      expect(result).toContain(newPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns "No differences found." for identical files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diff-test-'));
    const fileA = join(dir, 'a.txt');
    const fileB = join(dir, 'b.txt');

    try {
      await writeFile(fileA, 'same\n', 'utf-8');
      await writeFile(fileB, 'same\n', 'utf-8');

      const result = await diffFiles(fileA, fileB);
      expect(result).toBe('No differences found.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
