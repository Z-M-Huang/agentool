import { isAbsolute, join, basename, dirname, sep } from 'node:path';
import { executeRipgrep } from './ripgrep.js';

/** Options for the {@link glob} function. */
export interface GlobOptions {
  /** Maximum number of results to return. Defaults to 100. */
  limit?: number;
  /** Number of results to skip before returning. Defaults to 0. */
  offset?: number;
  /** Optional abort signal to cancel the search. */
  signal?: AbortSignal;
}

/**
 * Extract the static base directory from a glob pattern.
 *
 * The base directory is everything before the first glob special character
 * (`*`, `?`, `[`, `{`). Returns the directory portion and the remaining
 * relative pattern so callers can scope ripgrep to the narrowest directory.
 *
 * @param pattern - A glob pattern, possibly absolute.
 * @returns An object with `baseDir` (may be empty) and `relativePattern`.
 *
 * @example
 * ```typescript
 * extractGlobBaseDirectory('/home/user/src/*.ts');
 * // { baseDir: '/home/user/src', relativePattern: '*.ts' }
 *
 * extractGlobBaseDirectory('**\/utils/*.js');
 * // { baseDir: '', relativePattern: '**\/utils/*.js' }
 * ```
 */
export function extractGlobBaseDirectory(pattern: string): {
  baseDir: string;
  relativePattern: string;
} {
  // Find the first glob special character: *, ?, [, {
  const globChars = /[*?[{]/;
  const match = pattern.match(globChars);

  if (!match || match.index === undefined) {
    // No glob characters -- this is a literal path.
    // Return the directory portion and filename as pattern.
    const dir = dirname(pattern);
    const file = basename(pattern);
    return { baseDir: dir, relativePattern: file };
  }

  // Get everything before the first glob character
  const staticPrefix = pattern.slice(0, match.index);

  // Find the last path separator in the static prefix
  const lastSepIndex = Math.max(
    staticPrefix.lastIndexOf('/'),
    staticPrefix.lastIndexOf(sep),
  );

  if (lastSepIndex === -1) {
    // No path separator before the glob -- pattern is relative to cwd
    return { baseDir: '', relativePattern: pattern };
  }

  let baseDir = staticPrefix.slice(0, lastSepIndex);
  const relativePattern = pattern.slice(lastSepIndex + 1);

  // Handle root directory patterns (e.g., /*.txt)
  // When lastSepIndex is 0, baseDir is empty but we need '/' as root
  if (baseDir === '' && lastSepIndex === 0) {
    baseDir = '/';
  }

  return { baseDir, relativePattern };
}

/**
 * Find files matching a glob pattern using ripgrep `--files`.
 *
 * Returns absolute paths sorted by modification time (newest first via
 * `rg --sort=modified`). Uses `--hidden` and `--no-ignore` so hidden
 * files and gitignored files are included by default.
 *
 * @param pattern - A glob pattern (e.g. `"*.ts"`, `"src/**\/*.js"`).
 *                  May be absolute; the base directory is extracted automatically.
 * @param cwd     - The directory to search in.
 * @param options - Optional limit, offset, and abort signal.
 * @returns An object with `files` (absolute paths) and `truncated`
 *          (true when more results exist beyond limit + offset).
 *
 * @example
 * ```typescript
 * const { files, truncated } = await glob('*.ts', '/my/project', { limit: 10 });
 * // files: ['/my/project/index.ts', '/my/project/utils.ts', ...]
 * ```
 */
export async function glob(
  pattern: string,
  cwd: string,
  options?: GlobOptions,
): Promise<{ files: string[]; truncated: boolean }> {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  let searchDir = cwd;
  let searchPattern = pattern;

  // Handle absolute paths by extracting the base directory and
  // converting to a relative pattern. ripgrep's --glob flag only
  // works with relative patterns.
  if (isAbsolute(pattern)) {
    const { baseDir, relativePattern } = extractGlobBaseDirectory(pattern);
    if (baseDir) {
      searchDir = baseDir;
      searchPattern = relativePattern;
    }
  }

  const args = [
    '--files',
    '--glob',
    searchPattern,
    '--sort=modified',
    '--hidden',
    '--no-ignore',
  ];

  const allPaths = await executeRipgrep(args, searchDir, {
    signal: options?.signal,
  });

  // ripgrep returns relative paths; convert to absolute
  const absolutePaths = allPaths.map((p) =>
    isAbsolute(p) ? p : join(searchDir, p),
  );

  const truncated = absolutePaths.length > offset + limit;
  const files = absolutePaths.slice(offset, offset + limit);

  return { files, truncated };
}
