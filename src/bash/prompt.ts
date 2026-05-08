import type { BashConfig } from './index.js';
import { resolveShellOutputChars } from '../shared/shell.js';

/**
 * Generate the description prompt for the bash tool based on its configuration.
 *
 * The returned string is used as the tool's `description` field in the
 * Vercel AI SDK tool definition, providing the model with behavioral guidance.
 *
 * @param config - The same config passed to {@link createBash}.
 * @returns The full description string for the bash tool.
 */
export function getPrompt(
  config: Pick<BashConfig, 'timeout' | 'shell' | 'maxOutputChars'> = {},
): string {
  const timeout = config.timeout ?? 120_000;
  const timeoutMin = timeout / 60_000;
  const shell = config.shell ?? '$SHELL or /bin/bash';
  const maxOutputChars = resolveShellOutputChars(config.maxOutputChars);

  return `Execute a shell command and return its output (stdout, stderr, exit code).

Runs the command in ${shell} with \`-c\`. The working directory persists between calls.

## When to Use
- Build commands, git operations, system administration, installing packages
- Running scripts, compiling code, process management
- Any shell task that doesn't have a dedicated tool available

## When NOT to Use
- Reading file contents — use the dedicated file reading tool instead
- Searching file contents — use the dedicated content search tool instead
- Finding files by name/pattern — use the dedicated file search tool instead
- Editing files — use the dedicated file editing tool instead
- Writing new files — use the dedicated file writing tool instead
Prefer dedicated tools over shell equivalents (e.g., don't use cat, head, tail, sed, awk, grep, find, or echo when a dedicated tool exists). Dedicated tools provide better output formatting and permission handling.

## Usage Guidelines
- Default timeout: ${timeout}ms (${timeoutMin} minutes). Override with the timeout parameter.
- Timeout escalation: SIGTERM first, then SIGKILL after 5-second grace period.
- Output returned to the model is capped at ${maxOutputChars} characters. Raw stdout/stderr collection is capped at 10 MB per stream.
- Always quote file paths containing spaces with double quotes.
- When issuing multiple commands:
  - Independent commands: make separate tool calls in parallel.
  - Sequential with dependency: chain with \`&&\`.
  - Sequential ignoring failures: chain with \`;\`.
  - Do NOT use newlines to separate commands.
- Avoid unnecessary \`sleep\` commands:
  - Don't sleep between commands that can run immediately.
  - Don't retry failing commands in a sleep loop — diagnose the root cause.
  - If you must sleep, keep it short (1-5 seconds).
- For git commands:
  - Prefer creating new commits rather than amending existing ones.
  - Never skip hooks (--no-verify) unless the user explicitly requests it.
  - Before destructive operations (reset --hard, push --force), consider safer alternatives.`;
}
