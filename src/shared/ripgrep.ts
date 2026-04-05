import { execFile, execFileSync } from 'node:child_process';
import type { ExecFileException } from 'node:child_process';

const MAX_BUFFER_SIZE = 20_000_000; // 20MB
const DEFAULT_TIMEOUT = 20_000; // 20 seconds
const INSTALL_URL = 'https://github.com/BurntSushi/ripgrep#installation';

/**
 * Error thrown when the `rg` binary cannot be found on PATH.
 *
 * The message includes a link to the ripgrep installation instructions
 * so callers can surface actionable guidance to the user.
 */
export class RipgrepNotFoundError extends Error {
  constructor(message?: string) {
    super(
      message ??
        `ripgrep (rg) not found on PATH. ` +
          `Install it from: ${INSTALL_URL}`,
    );
    this.name = 'RipgrepNotFoundError';
  }
}

/**
 * Error thrown when a ripgrep search exceeds its timeout.
 *
 * Any lines that were captured before the timeout are available
 * via {@link partialResults} so callers can still return partial data.
 */
export class RipgrepTimeoutError extends Error {
  /**
   * Lines captured from stdout before the process was killed.
   * May be empty if no output arrived before the timeout.
   */
  public readonly partialResults: string[];

  constructor(message: string, partialResults: string[]) {
    super(message);
    this.name = 'RipgrepTimeoutError';
    this.partialResults = partialResults;
  }
}

/**
 * Locate the `rg` binary on the system PATH.
 *
 * Uses `which` to resolve the absolute path.
 * Throws {@link RipgrepNotFoundError} if `rg` is not installed.
 *
 * @returns The absolute path to the `rg` binary.
 * @throws {RipgrepNotFoundError} When `rg` cannot be found on PATH.
 */
export function findRg(): string {
  try {
    const result = execFileSync('which', ['rg'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    const rgPath = result.trim();
    if (!rgPath) {
      throw new RipgrepNotFoundError();
    }
    return rgPath;
  } catch (error: unknown) {
    if (error instanceof RipgrepNotFoundError) {
      throw error;
    }
    throw new RipgrepNotFoundError();
  }
}

/**
 * Check whether stderr indicates an EAGAIN error.
 *
 * EAGAIN ("Resource temporarily unavailable", OS error 11) occurs in
 * resource-constrained environments (Docker, CI) when ripgrep tries
 * to spawn too many threads.
 *
 * @param stderr - The stderr output from a ripgrep execution.
 * @returns `true` if the stderr contains EAGAIN indicators.
 */
export function isEagainError(stderr: string): boolean {
  return (
    stderr.includes('os error 11') ||
    stderr.includes('Resource temporarily unavailable')
  );
}

/**
 * Parse raw stdout from ripgrep into an array of result lines.
 *
 * Trims the output, splits on newlines, strips trailing `\r`
 * characters, and removes empty lines.
 */
function parseStdout(stdout: string): string[] {
  return stdout
    .trim()
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter(Boolean);
}

/** Options for {@link executeRipgrep}. */
export interface ExecuteRipgrepOptions {
  /** Timeout in milliseconds. Defaults to 20 000 (20 seconds). */
  timeout?: number;
  /** Optional abort signal to cancel the search. */
  signal?: AbortSignal;
}

/**
 * Execute a ripgrep search and return the matching lines.
 *
 * Handles the common ripgrep exit codes:
 * - **0** — matches found, lines returned.
 * - **1** — no matches, returns `[]`.
 * - **EAGAIN** — retries once with `-j 1` (single-threaded mode).
 * - **timeout** — throws {@link RipgrepTimeoutError} with any partial output.
 *
 * @param args - Arguments to pass to `rg` (flags, patterns, etc.).
 * @param target - The file or directory to search.
 * @param options - Optional timeout and abort signal.
 * @returns An array of result lines from ripgrep stdout.
 * @throws {RipgrepNotFoundError} If `rg` is not on PATH.
 * @throws {RipgrepTimeoutError} If the search exceeds the timeout.
 */
export async function executeRipgrep(
  args: string[],
  target: string,
  options?: ExecuteRipgrepOptions,
): Promise<string[]> {
  const rgPath = findRg();
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  return new Promise((resolve, reject) => {
    const handleResult = (
      error: ExecFileException | null,
      stdout: string,
      stderr: string,
      isRetry: boolean,
    ): void => {
      // Success — matches found
      if (!error) {
        resolve(parseStdout(stdout));
        return;
      }

      // Exit code 1 is normal "no matches"
      if (error.code === 1) {
        resolve([]);
        return;
      }

      // Critical errors that mean rg is broken, not just "no matches"
      const CRITICAL_CODES = ['ENOENT', 'EACCES', 'EPERM'];
      if (CRITICAL_CODES.includes(error.code as string)) {
        reject(error);
        return;
      }

      // EAGAIN — retry once with single-threaded mode
      if (!isRetry && isEagainError(stderr)) {
        execFile(
          rgPath,
          ['-j', '1', ...args, target],
          {
            maxBuffer: MAX_BUFFER_SIZE,
            signal: options?.signal,
            timeout,
            killSignal: 'SIGKILL',
          },
          (retryErr, retryStdout, retryStderr) => {
            handleResult(retryErr, retryStdout, retryStderr, true);
          },
        );
        return;
      }

      // Try to salvage partial results
      const hasOutput = stdout && stdout.trim().length > 0;
      const isTimeout =
        error.signal === 'SIGTERM' ||
        error.signal === 'SIGKILL' ||
        error.code === 'ABORT_ERR';
      const isBufferOverflow =
        error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';

      let lines: string[] = [];
      if (hasOutput) {
        lines = parseStdout(stdout);
        // Drop last line on timeout/overflow — it may be truncated
        if (lines.length > 0 && (isTimeout || isBufferOverflow)) {
          lines = lines.slice(0, -1);
        }
      }

      // Timeout with no results → throw so callers know it didn't complete
      if (isTimeout && lines.length === 0) {
        reject(
          new RipgrepTimeoutError(
            `Ripgrep search timed out after ${timeout / 1000} seconds. ` +
              `Try a more specific path or pattern.`,
            lines,
          ),
        );
        return;
      }

      // Return whatever partial results we have
      resolve(lines);
    };

    execFile(
      rgPath,
      [...args, target],
      {
        maxBuffer: MAX_BUFFER_SIZE,
        signal: options?.signal,
        timeout,
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        handleResult(error, stdout, stderr, false);
      },
    );
  });
}
