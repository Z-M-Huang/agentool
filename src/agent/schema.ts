import { jsonSchema } from 'ai';
import { z } from 'zod';

const validationSchema = z.discriminatedUnion('action', [
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

export type AgentInput = z.infer<typeof validationSchema>;

export const inputSchema = jsonSchema<AgentInput>(
  {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'wait', 'status', 'result', 'list', 'stop'],
        description: 'Agent task action to perform',
      },
      agent: {
        type: 'string',
        description: 'Configured agent name to run',
      },
      prompt: {
        type: 'string',
        description:
          'User prompt for the subagent. Required when action is start.',
      },
      description: {
        type: 'string',
        description: 'Short task label',
      },
      timeoutMs: {
        type: 'integer',
        minimum: 0,
        description: 'Run or wait timeout in milliseconds',
      },
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Task ids to wait for. Defaults to all running tasks.',
      },
      mode: {
        type: 'string',
        enum: ['all', 'any'],
        default: 'all',
        description: 'Wait for all selected tasks or the first selected task',
      },
      pollIntervalMs: {
        type: 'integer',
        exclusiveMinimum: 0,
        description: 'Internal polling interval in milliseconds',
      },
      taskId: {
        type: 'string',
        description:
          'Task id to inspect, read, or stop. Required when action is status, result, or stop.',
      },
    },
    required: ['action'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
  {
    validate: async (value) => {
      const result = await validationSchema.safeParseAsync(value);
      return result.success
        ? { success: true, value: result.data }
        : { success: false, error: result.error };
    },
  },
);
