import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';

/**
 * Configuration for the sleep tool.
 * Extends {@link BaseToolConfig} with an optional maximum duration cap.
 *
 * @example
 * ```typescript
 * import type { SleepConfig } from 'agentool/sleep';
 * const config: SleepConfig = { maxDuration: 60000 };
 * ```
 */
export interface SleepConfig extends BaseToolConfig {
  /**
   * Maximum allowed sleep duration in milliseconds.
   * Requested durations exceeding this value are clamped.
   * @default 300000 (5 minutes)
   */
  maxDuration?: number;
}

/**
 * Creates a sleep tool that pauses execution for a specified duration.
 *
 * The tool clamps the requested duration to `[0, maxDuration]` and reports
 * the actual elapsed time. It never throws; errors are returned as strings.
 *
 * @param config - Optional configuration with a custom max duration.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createSleep } from 'agentool/sleep';
 *
 * // Default max of 300 000 ms
 * const sleepTool = createSleep();
 *
 * // Custom max of 10 seconds
 * const shortSleep = createSleep({ maxDuration: 10000 });
 * ```
 */
export function createSleep(config: SleepConfig = {}) {
  const maxDuration = config.maxDuration ?? 300_000;

  return tool({
    description:
      'Pause execution for a specified duration. ' +
      'Useful for rate limiting, polling intervals, or waiting for external processes. ' +
      'Maximum duration is 300 seconds (5 minutes).',
    inputSchema: zodSchema(
      z.object({
        durationMs: z
          .number()
          .describe('Duration to sleep in milliseconds'),
        reason: z
          .string()
          .optional()
          .describe('Optional reason for the sleep'),
      }),
    ),
    execute: async ({ durationMs, reason }) => {
      try {
        const clamped = Math.max(0, Math.min(durationMs, maxDuration));

        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, clamped));
        const elapsed = Date.now() - start;

        const parts = [`Slept for ${elapsed}ms`];
        if (reason) parts.push(`Reason: ${reason}`);
        if (clamped !== durationMs) {
          parts.push(
            `(clamped from ${durationMs}ms to ${clamped}ms, max: ${maxDuration}ms)`,
          );
        }
        return parts.join('. ');
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return `Sleep failed: ${message}`;
      }
    },
  });
}

/**
 * Default sleep tool instance with a 300 000 ms (5-minute) maximum duration.
 *
 * @example
 * ```typescript
 * import { sleep } from 'agentool/sleep';
 * const result = await sleep.execute({ durationMs: 1000, reason: 'rate limit' });
 * ```
 */
export const sleep = createSleep();
