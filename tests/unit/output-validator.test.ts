import { describe, it, expect } from 'vitest';
import {
  createOutputValidator,
  outputValidator,
  type JsonSchema,
  type OutputValidationResult,
} from '../../src/output-validator/index.js';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

function parseResult(raw: string): OutputValidationResult {
  return JSON.parse(raw) as OutputValidationResult;
}

describe('output-validator tool', () => {
  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(outputValidator).toBeDefined();
      expect(typeof outputValidator.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof outputValidator.description).toBe('string');
      expect(outputValidator.description.length).toBeGreaterThan(0);
    });

    it('has an input schema defined', () => {
      expect(outputValidator.inputSchema).toBeDefined();
    });
  });

  describe('validation', () => {
    const schema: JsonSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['answer', 'confidence'],
      properties: {
        answer: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
    };

    it('returns valid true when content matches the configured schema', async () => {
      const tool = createOutputValidator({ schemaId: 'answer-v1', schema });
      const raw = await tool.execute(
        { content: '{"answer":"yes","confidence":0.9}' },
        toolOpts,
      );
      const result = parseResult(raw);

      expect(result.valid).toBe(true);
      expect(result.schemaId).toBe('answer-v1');
      expect(result.schemaHash).toMatch(/^[a-f0-9]{12}$/);
      expect(result.errors).toBeUndefined();
    });

    it('returns structured errors when content does not match the schema', async () => {
      const tool = createOutputValidator({ schemaId: 'answer-v1', schema });
      const raw = await tool.execute(
        { content: '{"answer":42,"extra":true}' },
        toolOpts,
      );
      const result = parseResult(raw);

      expect(result.valid).toBe(false);
      expect(result.schemaId).toBe('answer-v1');
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/confidence',
            keyword: 'required',
          }),
          expect.objectContaining({
            path: '/answer',
            keyword: 'type',
          }),
          expect.objectContaining({
            path: '/',
            keyword: 'additionalProperties',
          }),
        ]),
      );
    });

    it('returns a parse error when content is not valid JSON', async () => {
      const tool = createOutputValidator({ schemaId: 'answer-v1', schema });
      const raw = await tool.execute(
        { content: 'answer: yes' },
        toolOpts,
      );
      const result = parseResult(raw);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        expect.objectContaining({
          path: '/',
          keyword: 'parse',
        }),
      ]);
    });

    it('does not carry an old schema into a new validator instance', async () => {
      const oldTool = createOutputValidator({
        schemaId: 'old-turn',
        schema: {
          type: 'object',
          required: ['oldField'],
          properties: { oldField: { type: 'string' } },
        },
      });
      const newTool = createOutputValidator({
        schemaId: 'new-turn',
        schema: {
          type: 'object',
          required: ['newField'],
          properties: { newField: { type: 'string' } },
        },
      });

      const oldRaw = await oldTool.execute(
        { content: '{"newField":"ok"}' },
        toolOpts,
      );
      const newRaw = await newTool.execute(
        { content: '{"newField":"ok"}' },
        toolOpts,
      );

      expect(parseResult(oldRaw).valid).toBe(false);
      expect(parseResult(newRaw)).toMatchObject({
        valid: true,
        schemaId: 'new-turn',
      });
    });
  });

  describe('configuration errors', () => {
    it('returns an error when no schema is configured', async () => {
      const raw = await outputValidator.execute(
        { content: '{}' },
        toolOpts,
      );

      expect(raw).toContain('Error [output-validator]: No schema configured');
    });

    it('returns an error when the configured schema is invalid', async () => {
      const invalidSchema = {
        type: 'not-a-json-schema-type',
      } as unknown as JsonSchema;
      const tool = createOutputValidator({ schema: invalidSchema });
      const raw = await tool.execute(
        { content: '{}' },
        toolOpts,
      );

      expect(raw).toContain('Error [output-validator]: Invalid configured schema');
    });

    it('returns an error when the configured schema is async', async () => {
      const asyncSchema = {
        $async: true,
        type: 'object',
      };
      const tool = createOutputValidator({ schema: asyncSchema });
      const raw = await tool.execute(
        { content: '{}' },
        toolOpts,
      );

      expect(raw).toContain('Async JSON Schemas are not supported');
    });
  });
});
