import { tool } from 'ai';
import { z } from 'zod';
import type { TimeoutConfig } from '../shared/types.js';
import { executeShell } from '../shared/shell.js';
import { getPrompt } from './prompt.js';

export { getPrompt as bashPrompt } from './prompt.js';

/**
 * Configuration for the bash tool.
 * Extends {@link TimeoutConfig} with an optional shell binary path.
 *
 * @example
 * ```typescript
 * import type { BashConfig } from 'agentool/bash';
 * const config: BashConfig = { cwd: '/my/project', timeout: 30000, shell: '/bin/zsh' };
 * ```
 */
export interface BashConfig extends TimeoutConfig {
  /** Shell binary to use. Defaults to `$SHELL` or `/bin/bash`. */
  shell?: string;
  /** Override the default tool description. */
  description?: string;
}

/**
 * Creates a bash tool that executes shell commands via {@link executeShell}.
 *
 * The tool spawns the configured shell with `-c` and the given command string.
 * Timeout escalation follows SIGTERM then SIGKILL after a 5-second grace period.
 * Execute never throws; errors are returned as descriptive strings.
 *
 * @param config - Optional configuration for cwd, timeout, and shell binary.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createBash } from 'agentool/bash';
 *
 * const bashTool = createBash({ cwd: '/my/project', timeout: 60000 });
 * const result = await bashTool.execute(
 *   { command: 'ls -la' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createBash(config: BashConfig = {}) {
  const cwd = config.cwd ?? process.cwd();
  const timeout = config.timeout ?? 120_000;

  return tool({
    description: config.description ?? getPrompt(config),
    inputSchema: z.object({
      command: z.string().describe('The shell command to execute'),
      timeout: z
        .number()
        .optional()
        .describe('Timeout in milliseconds (default: 120000)'),
      description: z
        .string()
        .optional()
        .describe('Human-readable description of what the command does'),
    }),
    execute: async ({ command, timeout: cmdTimeout }) => {
      try {
        const result = await executeShell(command, {
          cwd,
          timeout: cmdTimeout ?? timeout,
          shell: config.shell,
        });

        const parts: string[] = [];
        if (result.stdout) parts.push(result.stdout);
        if (result.stderr) parts.push(`STDERR:\n${result.stderr}`);
        if (result.exitCode !== 0) parts.push(`Exit code: ${result.exitCode}`);

        return parts.length > 0
          ? parts.join('\n')
          : `Command completed with exit code ${result.exitCode}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error [bash]: Failed to execute command: ${msg}`;
      }
    },
  });
}

/**
 * Default bash tool instance using the current working directory,
 * a 120-second timeout, and the system default shell.
 *
 * @example
 * ```typescript
 * import { bash } from 'agentool/bash';
 * const result = await bash.execute(
 *   { command: 'echo hello' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export const bash = createBash();
