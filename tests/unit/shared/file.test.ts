import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addLineNumbers,
  writeTextContent,
  readFileInRange,
  pathExists,
} from '../../../src/shared/file.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `agentool-file-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// addLineNumbers
// ---------------------------------------------------------------------------
describe('addLineNumbers', () => {
  it('numbers lines starting from startLine', () => {
    const result = addLineNumbers({ content: 'alpha\nbeta\ngamma', startLine: 1 });
    expect(result).toBe('1\talpha\n2\tbeta\n3\tgamma');
  });

  it('returns empty string for empty content', () => {
    expect(addLineNumbers({ content: '', startLine: 1 })).toBe('');
  });

  it('applies an offset startLine', () => {
    const result = addLineNumbers({ content: 'x\ny', startLine: 5 });
    expect(result).toBe('5\tx\n6\ty');
  });

  it('handles CRLF by splitting correctly', () => {
    const result = addLineNumbers({ content: 'a\r\nb', startLine: 1 });
    expect(result).toBe('1\ta\n2\tb');
  });
});

// ---------------------------------------------------------------------------
// writeTextContent
// ---------------------------------------------------------------------------
describe('writeTextContent', () => {
  it('creates a file and parent directories', async () => {
    const filePath = join(tempDir, 'deep', 'nested', 'file.txt');
    await writeTextContent(filePath, 'hello world');

    const result = await readFileInRange(filePath);
    expect(result.content).toBe('hello world');
  });

  it('overwrites an existing file', async () => {
    const filePath = join(tempDir, 'overwrite.txt');
    writeFileSync(filePath, 'old content', 'utf-8');

    await writeTextContent(filePath, 'new content');

    const result = await readFileInRange(filePath);
    expect(result.content).toBe('new content');
  });
});

// ---------------------------------------------------------------------------
// readFileInRange
// ---------------------------------------------------------------------------
describe('readFileInRange', () => {
  it('reads the full file when no offset or limit is given', async () => {
    const filePath = join(tempDir, 'full.txt');
    writeFileSync(filePath, 'line1\nline2\nline3', 'utf-8');

    const result = await readFileInRange(filePath);
    expect(result.content).toBe('line1\nline2\nline3');
    expect(result.lineCount).toBe(3);
    expect(result.totalLines).toBe(3);
  });

  it('respects offset and maxLines', async () => {
    const filePath = join(tempDir, 'range.txt');
    writeFileSync(filePath, 'a\nb\nc\nd\ne', 'utf-8');

    const result = await readFileInRange(filePath, 1, 2);
    expect(result.content).toBe('b\nc');
    expect(result.lineCount).toBe(2);
    expect(result.totalLines).toBe(5);
  });

  it('strips UTF-8 BOM', async () => {
    const filePath = join(tempDir, 'bom.txt');
    const bom = '\uFEFF';
    writeFileSync(filePath, bom + 'hello\nworld', 'utf-8');

    const result = await readFileInRange(filePath);
    expect(result.content).toBe('hello\nworld');
    expect(result.content.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('converts CRLF to LF', async () => {
    const filePath = join(tempDir, 'crlf.txt');
    writeFileSync(filePath, 'one\r\ntwo\r\nthree', 'utf-8');

    const result = await readFileInRange(filePath);
    expect(result.content).toBe('one\ntwo\nthree');
    expect(result.content).not.toContain('\r');
  });

  it('throws on ENOENT for a missing file', async () => {
    const filePath = join(tempDir, 'no-such-file.txt');
    await expect(readFileInRange(filePath)).rejects.toThrow(/ENOENT/);
  });

  it('throws on EISDIR for a directory path', async () => {
    const dirPath = join(tempDir, 'a-directory');
    mkdirSync(dirPath);

    await expect(readFileInRange(dirPath)).rejects.toThrow(/EISDIR/);
  });

  it('handles an empty file', async () => {
    const filePath = join(tempDir, 'empty.txt');
    writeFileSync(filePath, '', 'utf-8');

    const result = await readFileInRange(filePath);
    expect(result.content).toBe('');
    expect(result.lineCount).toBe(1);
    expect(result.totalLines).toBe(1);
  });

  it('handles offset beyond file length', async () => {
    const filePath = join(tempDir, 'short.txt');
    writeFileSync(filePath, 'only\ntwo', 'utf-8');

    const result = await readFileInRange(filePath, 100, 5);
    expect(result.content).toBe('');
    expect(result.lineCount).toBe(0);
    expect(result.totalLines).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// readFileInRange — streaming path (files >= 10 MB)
// ---------------------------------------------------------------------------
describe('readFileInRange streaming path', () => {
  it('reads full content of a large file via streaming', async () => {
    const filePath = join(tempDir, 'large.txt');
    // Create a file > 10 MB with known content
    const lineCount = 200_000;
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      lines.push(`line-${i}-${'x'.repeat(50)}`);
    }
    writeFileSync(filePath, lines.join('\n'), 'utf-8');

    const result = await readFileInRange(filePath);
    expect(result.totalLines).toBe(lineCount);
    expect(result.lineCount).toBe(lineCount);
    expect(result.content).toContain('line-0-');
    expect(result.content).toContain(`line-${lineCount - 1}-`);
  });

  it('respects offset and maxLines in streaming path', async () => {
    const filePath = join(tempDir, 'large-range.txt');
    const lineCount = 200_000;
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      lines.push(`line-${i}`);
    }
    writeFileSync(filePath, lines.join('\n'), 'utf-8');

    const result = await readFileInRange(filePath, 5, 3);
    expect(result.content).toBe('line-5\nline-6\nline-7');
    expect(result.lineCount).toBe(3);
    expect(result.totalLines).toBe(lineCount);
  });

  it('strips BOM in streaming path', async () => {
    const filePath = join(tempDir, 'large-bom.txt');
    const bom = '\uFEFF';
    const lineCount = 200_000;
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      lines.push(`line-${i}-${'y'.repeat(50)}`);
    }
    writeFileSync(filePath, bom + lines.join('\n'), 'utf-8');

    const result = await readFileInRange(filePath, 0, 1);
    expect(result.content.charCodeAt(0)).not.toBe(0xfeff);
    expect(result.content).toBe('line-0-' + 'y'.repeat(50));
  });

  it('handles CRLF in streaming path', async () => {
    const filePath = join(tempDir, 'large-crlf.txt');
    const lineCount = 200_000;
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      lines.push(`line-${i}-${'z'.repeat(50)}`);
    }
    writeFileSync(filePath, lines.join('\r\n'), 'utf-8');

    const result = await readFileInRange(filePath, 0, 2);
    expect(result.content).not.toContain('\r');
    expect(result.content).toBe('line-0-' + 'z'.repeat(50) + '\nline-1-' + 'z'.repeat(50));
  });

  it('handles reading at end of large file', async () => {
    const filePath = join(tempDir, 'large-end.txt');
    const lineCount = 200_000;
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      lines.push(`line-${i}`);
    }
    writeFileSync(filePath, lines.join('\n'), 'utf-8');

    const result = await readFileInRange(filePath, lineCount - 2, 2);
    expect(result.content).toBe(`line-${lineCount - 2}\nline-${lineCount - 1}`);
    expect(result.lineCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// pathExists
// ---------------------------------------------------------------------------
describe('pathExists', () => {
  it('returns true for an existing file', async () => {
    const filePath = join(tempDir, 'exists.txt');
    writeFileSync(filePath, 'data', 'utf-8');

    expect(await pathExists(filePath)).toBe(true);
  });

  it('returns true for an existing directory', async () => {
    expect(await pathExists(tempDir)).toBe(true);
  });

  it('returns false for a non-existent path', async () => {
    expect(await pathExists(join(tempDir, 'nope'))).toBe(false);
  });
});
