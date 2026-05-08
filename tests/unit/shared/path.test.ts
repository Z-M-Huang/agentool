import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join, resolve, normalize } from 'node:path';
import {
  expandPath,
  toRelativePath,
  containsPathTraversal,
} from '../../../src/shared/path.js';

// ---------------------------------------------------------------------------
// expandPath
// ---------------------------------------------------------------------------
describe('expandPath', () => {
  it('expands bare ~ to the home directory', () => {
    expect(expandPath('~')).toBe(homedir());
  });

  it('expands ~/subdir to a path under the home directory', () => {
    expect(expandPath('~/Documents')).toBe(join(homedir(), 'Documents'));
  });

  it('resolves a relative path against the provided baseDir', () => {
    expect(expandPath('./src', '/project')).toBe(resolve('/project', 'src'));
  });

  it('normalizes an absolute path', () => {
    expect(expandPath('/usr/local/../bin')).toBe(normalize('/usr/local/../bin'));
  });

  it('returns the normalized baseDir for an empty string', () => {
    expect(expandPath('', '/fallback')).toBe(normalize('/fallback'));
  });

  it('returns the normalized baseDir for a whitespace-only string', () => {
    expect(expandPath('   ', '/fallback')).toBe(normalize('/fallback'));
  });

  it('throws TypeError for a non-string input', () => {
    // The cast is intentional -- we are testing the runtime guard.
    expect(() => expandPath(123 as unknown as string)).toThrow(TypeError);
  });

  it('throws Error when the path contains null bytes', () => {
    expect(() => expandPath('/tmp/\0evil')).toThrow('Path contains null bytes');
  });

  it('throws Error when baseDir contains null bytes', () => {
    expect(() => expandPath('ok', '/tmp/\0bad')).toThrow(
      'Path contains null bytes',
    );
  });

  it('defaults baseDir to process.cwd() when omitted', () => {
    expect(expandPath('foo')).toBe(resolve(process.cwd(), 'foo'));
  });

  it('throws TypeError when baseDir is not a string', () => {
    expect(() => expandPath('foo', 123 as unknown as string)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// toRelativePath
// ---------------------------------------------------------------------------
describe('toRelativePath', () => {
  it('returns a relative path when inside baseDir', () => {
    expect(toRelativePath('/project/src/index.ts', '/project')).toBe(
      'src/index.ts',
    );
  });

  it('returns the absolute path unchanged when outside baseDir', () => {
    expect(toRelativePath('/other/file.txt', '/project')).toBe(
      '/other/file.txt',
    );
  });

  it('returns an empty string for the baseDir itself', () => {
    expect(toRelativePath('/project', '/project')).toBe('');
  });

  it('defaults baseDir to process.cwd() when omitted', () => {
    expect(toRelativePath(resolve(process.cwd(), 'src/index.ts'))).toBe(
      'src/index.ts',
    );
  });
});

// ---------------------------------------------------------------------------
// containsPathTraversal
// ---------------------------------------------------------------------------
describe('containsPathTraversal', () => {
  it('detects leading ../', () => {
    expect(containsPathTraversal('../etc/passwd')).toBe(true);
  });

  it('detects mid-path /../', () => {
    expect(containsPathTraversal('src/../lib')).toBe(true);
  });

  it('detects trailing /..', () => {
    expect(containsPathTraversal('src/..')).toBe(true);
  });

  it('detects bare ..', () => {
    expect(containsPathTraversal('..')).toBe(true);
  });

  it('does not flag a normal path', () => {
    expect(containsPathTraversal('src/lib')).toBe(false);
  });

  it('does not flag a dotfile that starts with two dots', () => {
    expect(containsPathTraversal('..hidden')).toBe(false);
  });

  it('detects backslash-separated traversal', () => {
    expect(containsPathTraversal('src\\..\\lib')).toBe(true);
  });
});
