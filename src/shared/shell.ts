import { spawn } from 'child_process';

/** Maximum bytes collected per stream (stdout/stderr) to prevent OOM. */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

/** Default model-facing output cap, matching Claude Code's Bash output default. */
export const DEFAULT_SHELL_OUTPUT_CHARS = 30_000;

/** Maximum configurable model-facing output cap, matching Claude Code's upper bound. */
export const MAX_SHELL_OUTPUT_CHARS = 150_000;

/** Default command timeout in milliseconds (2 minutes). */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Grace period between SIGTERM and SIGKILL in milliseconds. */
const SIGKILL_GRACE_MS = 5_000;

/**
 * Result of a shell command execution.
 * Always returned -- the function never throws for non-zero exit codes.
 */
export interface ShellResult {
  /** Standard output collected from the child process. */
  stdout: string;
  /** Standard error collected from the child process. */
  stderr: string;
  /** Process exit code. 143 for SIGTERM, 137 for SIGKILL. */
  exitCode: number;
}

/**
 * Options for {@link executeShell}.
 */
export interface ShellOptions {
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Timeout in milliseconds. Defaults to 120000 (2 minutes). */
  timeout?: number;
  /** Shell binary path. Defaults to `process.env.SHELL` or `/bin/bash`. */
  shell?: string;
  /** Abort signal to cancel the running command. */
  signal?: AbortSignal;
}

/**
 * Resolve a requested model-facing output cap.
 *
 * Invalid values fall back to the default. Values above the Claude Code
 * parity upper bound are capped.
 */
export function resolveShellOutputChars(value?: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_SHELL_OUTPUT_CHARS;
  }
  return Math.min(Math.floor(value), MAX_SHELL_OUTPUT_CHARS);
}

/**
 * Truncate model-facing shell output while preserving the start of the output.
 */
export function truncateShellOutput(
  output: string,
  maxOutputChars: number = DEFAULT_SHELL_OUTPUT_CHARS,
): string {
  if (output.length <= maxOutputChars) {
    return output;
  }

  const omitted = output.length - maxOutputChars;
  return `${output.slice(0, maxOutputChars)}\n... [output truncated - ${omitted} chars removed]`;
}

/**
 * Execute a shell command and collect its output.
 *
 * Spawns the configured shell with `-c` and the given command string.
 * stdout and stderr are collected as strings, each capped at 10 MB.
 *
 * **Timeout escalation** (ported from Claude Code Shell.ts):
 * 1. On timeout, send SIGTERM to the process.
 * 2. Wait 5 seconds for graceful shutdown.
 * 3. If still alive, send SIGKILL.
 *
 * Never throws for non-zero exit codes -- the exit code is returned in
 * the result. Only throws when the child process cannot be spawned at all
 * (e.g. the shell binary does not exist).
 *
 * @param command - The shell command string to execute.
 * @param options - Optional execution configuration.
 * @returns The stdout, stderr, and exit code of the command.
 * @throws When the shell binary cannot be spawned (ENOENT, EACCES, etc.).
 *
 * @example
 * ```typescript
 * const result = await executeShell('echo hello');
 * console.log(result.stdout); // "hello\n"
 * console.log(result.exitCode); // 0
 * ```
 */
export async function executeShell(
  command: string,
  options?: ShellOptions,
): Promise<ShellResult> {
  const shellBin = options?.shell ?? process.env.SHELL ?? '/bin/bash';
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  return new Promise<ShellResult>((resolve, reject) => {
    const child = spawn(shellBin, ['-c', command], {
      cwd: options?.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Prevent visible console window on Windows (no-op elsewhere)
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let graceId: ReturnType<typeof setTimeout> | undefined;

    // ---- helpers ----

    function cleanup(): void {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (graceId !== undefined) {
        clearTimeout(graceId);
        graceId = undefined;
      }
      if (abortHandler && options?.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
    }

    function settle(result: ShellResult): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    // ---- stream collection (capped at MAX_BUFFER_BYTES) ----

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutBytes >= MAX_BUFFER_BYTES) return;
      const str = chunk.toString();
      const remaining = MAX_BUFFER_BYTES - stdoutBytes;
      if (chunk.length > remaining) {
        stdout += str.slice(0, remaining);
        stdoutBytes = MAX_BUFFER_BYTES;
      } else {
        stdout += str;
        stdoutBytes += chunk.length;
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= MAX_BUFFER_BYTES) return;
      const str = chunk.toString();
      const remaining = MAX_BUFFER_BYTES - stderrBytes;
      if (chunk.length > remaining) {
        stderr += str.slice(0, remaining);
        stderrBytes = MAX_BUFFER_BYTES;
      } else {
        stderr += str;
        stderrBytes += chunk.length;
      }
    });

    // ---- exit handling ----

    child.on('exit', (code, signal) => {
      const exitCode =
        code !== null
          ? code
          : signal === 'SIGKILL'
            ? 137
            : signal === 'SIGTERM'
              ? 143
              : 1;

      settle({ stdout, stderr, exitCode });
    });

    // Spawn-level errors (ENOENT, EACCES) -- the only case we reject.
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });

    // ---- timeout escalation: SIGTERM -> 5s grace -> SIGKILL ----

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        if (settled) return;
        child.kill('SIGTERM');

        graceId = setTimeout(() => {
          graceId = undefined;
          if (settled) return;
          child.kill('SIGKILL');
        }, SIGKILL_GRACE_MS);
      }, timeout);
    }

    // ---- abort signal handling ----

    const abortHandler = options?.signal
      ? (): void => {
          if (settled) return;
          child.kill('SIGTERM');
        }
      : undefined;

    if (abortHandler && options?.signal) {
      if (options.signal.aborted) {
        child.kill('SIGTERM');
      } else {
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }
    }
  });
}
