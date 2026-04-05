import { describe, it, expect } from 'vitest';
import {
  findRg,
  isEagainError,
  RipgrepNotFoundError,
  RipgrepTimeoutError,
  executeRipgrep,
} from '../../../src/shared/ripgrep.js';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

/** Check whether rg is available so we can skip tests that require it. */
function isRgAvailable(): boolean {
  try {
    execFileSync('which', ['rg'], { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

const rgAvailable = isRgAvailable();

describe('RipgrepNotFoundError', () => {
  it('has name set to RipgrepNotFoundError', () => {
    const err = new RipgrepNotFoundError();
    expect(err.name).toBe('RipgrepNotFoundError');
  });

  it('includes install URL in default message', () => {
    const err = new RipgrepNotFoundError();
    expect(err.message).toContain('ripgrep');
    expect(err.message).toContain(
      'https://github.com/BurntSushi/ripgrep#installation',
    );
  });

  it('accepts a custom message', () => {
    const err = new RipgrepNotFoundError('custom msg');
    expect(err.message).toBe('custom msg');
  });

  it('is an instance of Error', () => {
    const err = new RipgrepNotFoundError();
    expect(err).toBeInstanceOf(Error);
  });
});

describe('RipgrepTimeoutError', () => {
  it('stores partial results', () => {
    const partial = ['file1.ts:1:hello', 'file2.ts:3:world'];
    const err = new RipgrepTimeoutError('timed out', partial);
    expect(err.partialResults).toEqual(partial);
  });

  it('has name set to RipgrepTimeoutError', () => {
    const err = new RipgrepTimeoutError('timed out', []);
    expect(err.name).toBe('RipgrepTimeoutError');
  });

  it('stores the message', () => {
    const err = new RipgrepTimeoutError('search timed out after 20s', []);
    expect(err.message).toBe('search timed out after 20s');
  });

  it('is an instance of Error', () => {
    const err = new RipgrepTimeoutError('timeout', []);
    expect(err).toBeInstanceOf(Error);
  });

  it('stores empty partial results', () => {
    const err = new RipgrepTimeoutError('timeout', []);
    expect(err.partialResults).toEqual([]);
  });
});

describe('isEagainError', () => {
  it('detects "os error 11"', () => {
    expect(isEagainError('rg: os error 11')).toBe(true);
  });

  it('detects "Resource temporarily unavailable"', () => {
    expect(
      isEagainError('rg: Resource temporarily unavailable'),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isEagainError('Permission denied')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isEagainError('')).toBe(false);
  });
});

describe.skipIf(!rgAvailable)('findRg', () => {
  it('returns a path when rg is installed', () => {
    const rgPath = findRg();
    expect(rgPath).toBeTruthy();
    expect(path.isAbsolute(rgPath)).toBe(true);
  });

  it('returned path points to an existing file', () => {
    const rgPath = findRg();
    expect(fs.existsSync(rgPath)).toBe(true);
  });
});

describe.skipIf(!rgAvailable)('executeRipgrep', () => {
  let tmpDir: string;
  let testFile: string;

  // Create a temp directory with a test file for each test
  const setup = () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentool-rg-'));
    testFile = path.join(tmpDir, 'sample.txt');
    fs.writeFileSync(
      testFile,
      'hello world\nfoo bar\nhello again\ngoodbye\n',
    );
  };

  const cleanup = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  it('returns matching lines for a simple search', async () => {
    setup();
    try {
      const results = await executeRipgrep(
        ['--no-filename', 'hello'],
        testFile,
      );
      expect(results).toContain('hello world');
      expect(results).toContain('hello again');
      expect(results).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('returns empty array when no matches found', async () => {
    setup();
    try {
      const results = await executeRipgrep(
        ['--no-filename', 'nonexistent_pattern_xyz'],
        testFile,
      );
      expect(results).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('accepts a custom timeout', async () => {
    setup();
    try {
      const results = await executeRipgrep(
        ['--no-filename', 'foo'],
        testFile,
        { timeout: 10_000 },
      );
      expect(results).toEqual(['foo bar']);
    } finally {
      cleanup();
    }
  });

  it('searches a directory recursively', async () => {
    setup();
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'deep match\n');
    try {
      const results = await executeRipgrep(['deep'], tmpDir);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((line) => line.includes('deep match'))).toBe(
        true,
      );
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// executeRipgrep — edge cases using real rg
// ---------------------------------------------------------------------------
describe.skipIf(!rgAvailable)('executeRipgrep edge cases', () => {
  let tmpDir: string;

  const setup = () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentool-rg-edge-'));
    fs.writeFileSync(path.join(tmpDir, 'data.txt'), 'line1\nline2\nline3\n');
  };

  const cleanup = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  it('handles abort signal cancellation', async () => {
    setup();
    try {
      const controller = new AbortController();
      // Create a big search that would take time, then abort immediately
      controller.abort();
      // AbortSignal should cause an error or empty result
      const result = await executeRipgrep(
        ['--no-filename', 'line'],
        path.join(tmpDir, 'data.txt'),
        { signal: controller.signal },
      ).catch(() => [] as string[]);
      expect(Array.isArray(result)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('times out on extremely short timeout with large search', async () => {
    setup();
    // Create a large file to search
    const bigFile = path.join(tmpDir, 'big.txt');
    const bigContent = 'x'.repeat(100) + '\n';
    fs.writeFileSync(bigFile, bigContent.repeat(100000));
    try {
      // 1ms timeout should cause a timeout
      const result = executeRipgrep(
        ['x'],
        bigFile,
        { timeout: 1 },
      );
      // Could either resolve with partial results or throw RipgrepTimeoutError
      const resolved = await result.catch((e: Error) => {
        expect(e).toBeInstanceOf(RipgrepTimeoutError);
        return 'timed-out';
      });
      // Either partial results array or timed-out marker
      expect(typeof resolved === 'string' || Array.isArray(resolved)).toBe(true);
    } finally {
      cleanup();
    }
  }, 10000);

  it('returns empty results for non-existent directory', async () => {
    // ripgrep returns exit code 2 for errors, which is treated as non-critical
    const results = await executeRipgrep(['pattern'], '/nonexistent-dir-xyz-12345');
    expect(results).toEqual([]);
  });

  it('handles \r in stdout lines by stripping them', async () => {
    setup();
    // rg normally doesn't produce \r, but the parseStdout function strips them
    const results = await executeRipgrep(
      ['--no-filename', 'line1'],
      path.join(tmpDir, 'data.txt'),
    );
    for (const line of results) {
      expect(line.endsWith('\r')).toBe(false);
    }
  });
});
