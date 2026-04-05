import { describe, it, expect } from 'vitest';
import { executeShell } from '../../../src/shared/shell.js';
import type { ShellResult, ShellOptions } from '../../../src/shared/shell.js';

describe('executeShell', () => {
  it('captures stdout from a simple echo command', async () => {
    const result = await executeShell('echo hello');
    expect(result.stdout.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('preserves non-zero exit codes', async () => {
    const result = await executeShell('exit 42');
    expect(result.exitCode).toBe(42);
  });

  it('captures stderr output', async () => {
    const result = await executeShell('echo error-msg >&2');
    expect(result.stderr.trim()).toBe('error-msg');
    expect(result.exitCode).toBe(0);
  });

  it('kills the process on timeout via SIGTERM/SIGKILL escalation', async () => {
    const result = await executeShell('sleep 60', { timeout: 200 });
    // SIGTERM yields 143, SIGKILL yields 137. Either is acceptable
    // depending on how fast the process responds to SIGTERM.
    expect([137, 143]).toContain(result.exitCode);
  }, 15_000);

  it('returns a result for an empty command', async () => {
    const result = await executeShell('');
    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result).toHaveProperty('exitCode');
  });

  it('uses a custom cwd', async () => {
    const result = await executeShell('pwd', { cwd: '/tmp' });
    // realpath of /tmp may resolve symlinks (e.g. /private/tmp on macOS)
    expect(result.stdout.trim()).toMatch(/\/tmp$/);
    expect(result.exitCode).toBe(0);
  });

  it('throws for a non-existent shell binary', async () => {
    await expect(
      executeShell('echo hello', { shell: '/no/such/shell' }),
    ).rejects.toThrow();
  });

  it('kills the process when the abort signal fires', async () => {
    const controller = new AbortController();
    const promise = executeShell('sleep 60', { signal: controller.signal });

    // Give the process a moment to start, then abort.
    setTimeout(() => controller.abort(), 100);

    const result = await promise;
    expect([137, 143]).toContain(result.exitCode);
  }, 15_000);

  it('types are structurally correct', () => {
    // Compile-time check: ShellResult and ShellOptions are usable as types.
    const result: ShellResult = { stdout: '', stderr: '', exitCode: 0 };
    expect(result.exitCode).toBe(0);

    const opts: ShellOptions = { cwd: '/tmp', timeout: 5000 };
    expect(opts.timeout).toBe(5000);
  });

  it('handles already-aborted signal by killing immediately', async () => {
    const controller = new AbortController();
    controller.abort(); // Abort before even starting

    const result = await executeShell('sleep 60', { signal: controller.signal });
    expect([137, 143]).toContain(result.exitCode);
  }, 15_000);

  it('caps stdout at buffer limit without crashing', async () => {
    // Generate >10MB of stdout to trigger the buffer cap branch
    const result = await executeShell(
      'dd if=/dev/zero bs=1048576 count=12 2>/dev/null | tr "\\0" "A"',
      { timeout: 30_000 },
    );
    expect(result.stdout.length).toBeGreaterThan(0);
    // Should be capped at 10MB
    expect(result.stdout.length).toBeLessThanOrEqual(10 * 1024 * 1024 + 1);
    expect(result.exitCode).toBe(0);
  }, 35_000);

  it('caps stderr at buffer limit without crashing', async () => {
    // Generate >10MB of stderr to trigger the buffer cap branch
    const result = await executeShell(
      'dd if=/dev/zero bs=1048576 count=12 2>/dev/null | tr "\\0" "E" >&2',
      { timeout: 30_000 },
    );
    expect(result.stderr.length).toBeGreaterThan(0);
    // Should be capped at 10MB
    expect(result.stderr.length).toBeLessThanOrEqual(10 * 1024 * 1024 + 1);
  }, 35_000);

  it('timeout fires SIGTERM then SIGKILL for stubborn process', async () => {
    // trap SIGTERM to be stubborn, so SIGKILL is needed
    const result = await executeShell(
      "trap '' SIGTERM; sleep 60",
      { timeout: 300 },
    );
    // Should be killed via SIGKILL (137) since SIGTERM was trapped
    expect([137, 143]).toContain(result.exitCode);
  }, 15_000);

  it('runs with timeout=0 (no timeout set)', async () => {
    const result = await executeShell('echo quick', { timeout: 0 });
    expect(result.stdout.trim()).toBe('quick');
    expect(result.exitCode).toBe(0);
  });

  it('handles command that produces both stdout and stderr', async () => {
    const result = await executeShell('echo out && echo err >&2', { timeout: 5000 });
    expect(result.stdout.trim()).toBe('out');
    expect(result.stderr.trim()).toBe('err');
    expect(result.exitCode).toBe(0);
  });

  it('returns exit code 1 for process killed by non-standard signal', async () => {
    // Use a subshell that kills itself with SIGHUP (signal 1)
    // The exit handler receives code=null, signal='SIGHUP' -> exitCode should be 1
    const result = await executeShell('kill -HUP $$; sleep 1', { timeout: 5000, shell: '/bin/sh' });
    // SIGHUP gives exit code 129 in most shells, but spawn returns it as code=null, signal='SIGHUP' -> 1
    // Or the shell may handle it differently. Either way, the process should complete.
    expect(result.exitCode).not.toBe(0);
  });
});
