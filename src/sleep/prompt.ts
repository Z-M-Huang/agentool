import type { SleepConfig } from './index.js';

/**
 * Generate the description prompt for the sleep tool based on its configuration.
 *
 * @param config - The same config passed to {@link createSleep}.
 * @returns The full description string for the sleep tool.
 */
export function getPrompt(
  config: Pick<SleepConfig, 'maxDuration'> = {},
): string {
  const maxDuration = config.maxDuration ?? 300_000;
  const maxSec = maxDuration / 1000;

  return `Pause execution for a specified duration. Maximum duration: ${maxSec} seconds (${maxDuration}ms).

## When to Use
- When rate-limited by an external API and need to wait before retrying
- When waiting for an external process to complete
- Prefer this over shell sleep commands — it doesn't hold a shell process

## When NOT to Use
- Don't sleep between commands that can run immediately — just run them
- Don't retry failing commands in a sleep loop — diagnose the root cause first
- Avoid long sleeps that block the user — keep durations short when possible

## Usage Guidelines
- Durations exceeding the maximum are automatically clamped to ${maxDuration}ms
- Provide a \`reason\` parameter to document why the sleep is needed
- Each sleep costs an API turn — use judiciously`;
}
