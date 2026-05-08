import { execFile, execFileSync, spawn } from 'node:child_process';
import type { ExecFileException } from 'node:child_process';

const MAX_BUFFER_SIZE = 20_000_000; // 20MB
const DEFAULT_TIMEOUT = 20_000; // 20 seconds
const INSTALL_URL = 'https://github.com/BurntSushi/ripgrep#installation';

/** Error thrown when the `rg` binary cannot be found on PATH. */
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

/** Error thrown when a ripgrep search exceeds its timeout. */
export class RipgrepTimeoutError extends Error {
  /** Lines captured from stdout before the process was killed. */
  public readonly partialResults: string[];

  constructor(message: string, partialResults: string[]) {
    super(message);
    this.name = 'RipgrepTimeoutError';
    this.partialResults = partialResults;
  }
}

/** Locate the `rg` binary on the system PATH. */
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

/** Check whether stderr indicates an EAGAIN error. */
export function isEagainError(stderr: string): boolean {
  return (
    stderr.includes('os error 11') ||
    stderr.includes('Resource temporarily unavailable')
  );
}

/** Parse raw stdout from ripgrep into an array of result lines. */
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

export interface ExecuteRipgrepStreamOptions extends ExecuteRipgrepOptions {
  /** Callback invoked with complete stdout lines as they arrive. */
  onLines: (lines: string[]) => void;
}

/** Stream complete ripgrep stdout lines as they arrive. */
export async function executeRipgrepStream(
  args: string[],
  target: string,
  options: ExecuteRipgrepStreamOptions,
): Promise<void> {
  const rgPath = findRg();
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  return new Promise<void>((resolve, reject) => {
    const child = spawn(rgPath, [...args, target], {
      signal: options.signal,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let remainder = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const stripCR = (line: string): string => line.replace(/\r$/, '');
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      const data = remainder + chunk.toString();
      const lines = data.split('\n');
      remainder = lines.pop() ?? '';
      if (lines.length > 0) {
        options.onLines(lines.map(stripCR).filter(Boolean));
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length >= MAX_BUFFER_SIZE) return;
      const remaining = MAX_BUFFER_SIZE - stderr.length;
      const str = chunk.toString();
      stderr += str.length > remaining ? str.slice(0, remaining) : str;
    });

    child.on('close', (code) => {
      if (settled) return;

      if (timedOut) {
        settle(
          new RipgrepTimeoutError(
            `Ripgrep search timed out after ${timeout / 1000} seconds. ` +
              `Try a more specific path or pattern.`,
            [],
          ),
        );
        return;
      }

      if (options.signal?.aborted) {
        settle(new Error('Ripgrep stream aborted.'));
        return;
      }

      if (code === 0 || code === 1) {
        if (remainder) {
          options.onLines([stripCR(remainder)].filter(Boolean));
        }
        settle();
        return;
      }

      settle(
        new Error(stderr.trim() || `ripgrep exited with code ${String(code)}`),
      );
    });

    child.on('error', (error) => {
      if (settled) return;
      settle(options.signal?.aborted ? new Error('Ripgrep stream aborted.') : error);
    });

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);
    }
  });
}

/** Execute a ripgrep search and return the matching lines. */
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
