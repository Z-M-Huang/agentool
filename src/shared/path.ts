import { homedir } from 'node:os';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

/**
 * Expand a path that may contain tilde (`~`) notation into an absolute path.
 *
 * - `~` expands to the user's home directory.
 * - `~/foo` expands to `<homedir>/foo`.
 * - Relative paths are resolved against `baseDir` (defaults to `process.cwd()`).
 * - Absolute paths are returned normalized.
 * - Empty / whitespace-only strings return the normalized `baseDir`.
 *
 * @param inputPath - The path to expand.
 * @param baseDir   - Base directory for resolving relative paths.
 *                    Defaults to `process.cwd()`.
 * @returns The expanded absolute path.
 * @throws {TypeError} If `inputPath` is not a string.
 * @throws {Error}     If `inputPath` or `baseDir` contains null bytes.
 *
 * @example
 * ```typescript
 * expandPath('~');                       // '/home/user'
 * expandPath('~/Documents');             // '/home/user/Documents'
 * expandPath('./src', '/project');       // '/project/src'
 * expandPath('/absolute/path');          // '/absolute/path'
 * expandPath('', '/fallback');           // '/fallback'
 * ```
 */
export function expandPath(inputPath: string, baseDir?: string): string {
  const actualBaseDir = baseDir ?? process.cwd();

  // Input validation
  if (typeof inputPath !== 'string') {
    throw new TypeError(
      `Path must be a string, received ${typeof inputPath}`,
    );
  }

  if (typeof actualBaseDir !== 'string') {
    throw new TypeError(
      `Base directory must be a string, received ${typeof actualBaseDir}`,
    );
  }

  // Security: reject null bytes
  if (inputPath.includes('\0') || actualBaseDir.includes('\0')) {
    throw new Error('Path contains null bytes');
  }

  // Handle empty or whitespace-only paths
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return normalize(actualBaseDir);
  }

  // Home-directory shorthand
  if (trimmed === '~') {
    return homedir();
  }
  if (trimmed.startsWith('~/')) {
    return join(homedir(), trimmed.slice(2));
  }

  // Absolute paths
  if (isAbsolute(trimmed)) {
    return normalize(trimmed);
  }

  // Relative paths
  return resolve(actualBaseDir, trimmed);
}

/**
 * Convert an absolute path to a path relative to `baseDir`.
 *
 * If the resulting relative path would escape `baseDir` (i.e. it starts
 * with `..`), the original absolute path is returned unchanged so it stays
 * unambiguous.
 *
 * @param absolutePath - The absolute path to convert.
 * @param baseDir      - Reference directory. Defaults to `process.cwd()`.
 * @returns A relative path when inside `baseDir`, otherwise the original
 *          absolute path.
 *
 * @example
 * ```typescript
 * toRelativePath('/project/src/index.ts', '/project');  // 'src/index.ts'
 * toRelativePath('/other/file.txt', '/project');         // '/other/file.txt'
 * ```
 */
export function toRelativePath(
  absolutePath: string,
  baseDir?: string,
): string {
  const rel = relative(baseDir ?? process.cwd(), absolutePath);
  return rel.startsWith('..') ? absolutePath : rel;
}

/**
 * Check whether a path contains directory-traversal patterns (`..`).
 *
 * Detects `..` as a standalone segment at the start, middle, or end of the
 * path, with either forward or back-slash separators.
 *
 * @param inputPath - The path string to inspect.
 * @returns `true` if the path contains a `..` traversal segment.
 *
 * @example
 * ```typescript
 * containsPathTraversal('../etc/passwd');   // true
 * containsPathTraversal('src/../lib');      // true
 * containsPathTraversal('src/lib');         // false
 * containsPathTraversal('..hidden');        // false
 * ```
 */
export function containsPathTraversal(inputPath: string): boolean {
  return /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(inputPath);
}
