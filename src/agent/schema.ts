import { z } from 'zod';

export const inputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    agent: z.string().optional().describe('Configured agent name to run'),
    prompt: z.string().describe('User prompt for the subagent'),
    description: z.string().optional().describe('Short task label'),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Run timeout in milliseconds'),
  }),
  z.object({
    action: z.literal('wait'),
    taskIds: z
      .array(z.string())
      .optional()
      .describe('Task ids to wait for. Defaults to all running tasks.'),
    mode: z
      .enum(['all', 'any'])
      .optional()
      .default('all')
      .describe('Wait for all selected tasks or the first selected task'),
    timeoutMs: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Wait timeout in milliseconds'),
    pollIntervalMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Internal polling interval in milliseconds'),
  }),
  z.object({
    action: z.literal('status'),
    taskId: z.string().describe('Task id to inspect'),
  }),
  z.object({
    action: z.literal('result'),
    taskId: z.string().describe('Task id to read'),
  }),
  z.object({
    action: z.literal('list'),
  }),
  z.object({
    action: z.literal('stop'),
    taskId: z.string().describe('Task id to stop'),
  }),
]);

export type AgentInput = z.infer<typeof inputSchema>;
