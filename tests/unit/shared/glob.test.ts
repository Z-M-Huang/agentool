import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractGlobBaseDirectory, glob } from '../../../src/shared/glob.js';

/** Check whether rg is available so we can skip integration tests. */
function isRgAvailable(): boolean {
  try {
    execFileSync('which', ['rg'], { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

const rgAvailable = isRgAvailable();

// ── extractGlobBaseDirectory (pure logic, no rg needed) ──────────────

describe('extractGlobBaseDirectory', () => {
  it('extracts directory and relative pattern from absolute glob', () => {
    const result = extractGlobBaseDirectory('/home/user/src/*.ts');
    expect(result.baseDir).toBe('/home/user/src');
    expect(result.relativePattern).toBe('*.ts');
  });

  it('returns empty baseDir when pattern has no path separator before glob', () => {
    const result = extractGlobBaseDirectory('*.ts');
    expect(result.baseDir).toBe('');
    expect(result.relativePattern).toBe('*.ts');
  });

  it('treats literal paths as dirname + basename', () => {
    const result = extractGlobBaseDirectory('/home/user/file.txt');
    expect(result.baseDir).toBe('/home/user');
    expect(result.relativePattern).toBe('file.txt');
  });

  it('handles root directory patterns', () => {
    const result = extractGlobBaseDirectory('/*.txt');
    expect(result.baseDir).toBe('/');
    expect(result.relativePattern).toBe('*.txt');
  });

  it('handles deeply nested glob patterns', () => {
    const result = extractGlobBaseDirectory('/a/b/c/**/*.js');
    expect(result.baseDir).toBe('/a/b/c');
    expect(result.relativePattern).toBe('**/*.js');
  });
});

// ── glob integration tests (require rg) ─────────────────────────────

describe.skipIf(!rgAvailable)('glob', () => {
  let tmpDir: string;

  const setup = () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentool-glob-'));

    // Create a small file tree:
    //   tmpDir/
    //     alpha.ts
    //     beta.ts
    //     gamma.js
    //     sub/
    //       delta.ts
    //       epsilon.js
    fs.writeFileSync(path.join(tmpDir, 'alpha.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(tmpDir, 'beta.ts'), 'export const b = 2;\n');
    fs.writeFileSync(path.join(tmpDir, 'gamma.js'), 'module.exports = 3;\n');

    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'delta.ts'), 'export const d = 4;\n');
    fs.writeFileSync(
      path.join(subDir, 'epsilon.js'),
      'module.exports = 5;\n',
    );
  };

  const cleanup = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  it('finds .ts files recursively', async () => {
    setup();
    try {
      const { files, truncated } = await glob('*.ts', tmpDir);
      expect(truncated).toBe(false);
      // Should find alpha.ts, beta.ts, sub/delta.ts
      expect(files).toHaveLength(3);
      for (const f of files) {
        expect(path.isAbsolute(f)).toBe(true);
        expect(f.endsWith('.ts')).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  it('returns empty array when pattern matches nothing', async () => {
    setup();
    try {
      const { files, truncated } = await glob('*.xyz', tmpDir);
      expect(files).toEqual([]);
      expect(truncated).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('truncates results when limit is exceeded', async () => {
    setup();
    try {
      const { files, truncated } = await glob('*.ts', tmpDir, { limit: 2 });
      expect(files).toHaveLength(2);
      expect(truncated).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('skips results when offset is provided', async () => {
    setup();
    try {
      const allResult = await glob('*.ts', tmpDir);
      const offsetResult = await glob('*.ts', tmpDir, { offset: 1 });

      // Offset by 1 should return one fewer file
      expect(offsetResult.files).toHaveLength(allResult.files.length - 1);
      // The first file from the offset result should be the second file from all
      expect(offsetResult.files[0]).toBe(allResult.files[1]);
    } finally {
      cleanup();
    }
  });

  it('handles absolute path patterns', async () => {
    setup();
    try {
      const absolutePattern = path.join(tmpDir, '*.ts');
      const { files } = await glob(absolutePattern, '/');

      // Should still find the .ts files in tmpDir
      expect(files.length).toBeGreaterThanOrEqual(1);
      for (const f of files) {
        expect(path.isAbsolute(f)).toBe(true);
        expect(f.startsWith(tmpDir)).toBe(true);
        expect(f.endsWith('.ts')).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  it('returns all paths as absolute', async () => {
    setup();
    try {
      const { files } = await glob('*', tmpDir);
      for (const f of files) {
        expect(path.isAbsolute(f)).toBe(true);
      }
    } finally {
      cleanup();
    }
  });
});
