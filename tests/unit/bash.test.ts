import { describe, it, expect } from 'vitest';
import { createBash, bash } from '../../src/bash/index.js';
import * as os from 'os';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('bash tool', () => {
  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(bash).toBeDefined();
      expect(typeof bash.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof bash.description).toBe('string');
      expect(bash.description.length).toBeGreaterThan(0);
    });

    it('has input schema defined', () => {
      expect(bash.inputSchema).toBeDefined();
    });
  });

  describe('echo command', () => {
    it('returns stdout from a simple echo', async () => {
      const result = await bash.execute(
        { command: 'echo hello world' },
        toolOpts,
      );
      expect(result).toContain('hello world');
    });
  });

  describe('exit code preservation', () => {
    it('captures non-zero exit codes', async () => {
      const result = await bash.execute(
        { command: 'exit 42' },
        toolOpts,
      );
      expect(result).toContain('Exit code: 42');
    });
  });

  describe('stderr capture', () => {
    it('captures stderr output', async () => {
      const result = await bash.execute(
        { command: 'echo error-msg >&2' },
        toolOpts,
      );
      expect(result).toContain('STDERR:');
      expect(result).toContain('error-msg');
    });
  });

  describe('timeout', () => {
    it('triggers error on timeout', async () => {
      const shortTimeout = createBash({ timeout: 200 });
      const result = await shortTimeout.execute(
        { command: 'sleep 30' },
        toolOpts,
      );
      // SIGTERM produces exit code 143
      expect(result).toMatch(/Exit code: (143|137)/);
    }, 15_000);
  });

  describe('per-command timeout override', () => {
    it('uses the per-command timeout parameter', async () => {
      const result = await bash.execute(
        { command: 'sleep 30', timeout: 200 },
        toolOpts,
      );
      expect(result).toMatch(/Exit code: (143|137)/);
    }, 15_000);
  });

  describe('factory with custom cwd', () => {
    it('runs commands in the configured working directory', async () => {
      const tmpDir = os.tmpdir();
      const customBash = createBash({ cwd: tmpDir });
      const result = await customBash.execute(
        { command: 'pwd' },
        toolOpts,
      );
      // tmpdir may resolve through symlinks (e.g. /tmp -> /private/tmp on macOS)
      // so check that the output contains either the raw or resolved path
      const resolvedTmp = await bash.execute(
        { command: `cd "${tmpDir}" && pwd` },
        toolOpts,
      );
      expect(result.trim()).toBe(resolvedTmp.trim());
    });
  });

  describe('description parameter', () => {
    it('accepts a description parameter without affecting output', async () => {
      const result = await bash.execute(
        { command: 'echo ok', description: 'Test echo command' },
        toolOpts,
      );
      expect(result).toContain('ok');
    });
  });

  describe('successful command with zero exit code', () => {
    it('returns the default message when stdout and stderr are empty', async () => {
      const result = await bash.execute(
        { command: 'true' },
        toolOpts,
      );
      expect(result).toBe('Command completed with exit code 0');
    });
  });

  describe('error handling', () => {
    it('returns error string for invalid shell', async () => {
      const badShell = createBash({ shell: '/nonexistent/shell' });
      const result = await badShell.execute(
        { command: 'echo hi' },
        toolOpts,
      );
      expect(result).toContain('Error [bash]:');
      expect(result).toContain('Failed to execute command');
    });
  });
});
