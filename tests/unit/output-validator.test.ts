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

    it('includes the JSON-stringified value at the failing instance path', async () => {
      const tool = createOutputValidator({
        schemaId: 'acceptance-v1',
        schema: {
          type: 'object',
          required: ['canonical_acceptance_criteria'],
          properties: {
            canonical_acceptance_criteria: {
              type: 'array',
              items: {
                type: 'object',
                required: ['visibility'],
                properties: {
                  visibility: {
                    type: 'object',
                    required: ['initial_state'],
                    properties: {
                      initial_state: { type: 'string' },
                      trigger_selector: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const raw = await tool.execute(
        {
          content: JSON.stringify({
            canonical_acceptance_criteria: [{
              visibility: { trigger_selector: '.foo' },
            }],
          }),
        },
        toolOpts,
      );
      const result = parseResult(raw);
      const error = result.errors?.find(({ path }) =>
        path === '/canonical_acceptance_criteria/0/visibility/initial_state'
      );

      expect(error).toMatchObject({
        keyword: 'required',
        instanceValue: '{"trigger_selector":".foo"}',
      });
    });

    it('truncates long instance values', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string', maxLength: 5 },
          },
        },
      });

      const raw = await tool.execute(
        { content: JSON.stringify({ text: 'x'.repeat(300) }) },
        toolOpts,
      );
      const result = parseResult(raw);
      const error = result.errors?.find(({ path }) => path === '/text');

      expect(error?.instanceValue).toHaveLength(200);
      expect(error?.instanceValue?.endsWith('...')).toBe(true);
    });

    it('validates string enum properties', async () => {
      const enumSchema: JsonSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['queued', 'running', 'done'] },
        },
      };
      const tool = createOutputValidator({
        schemaId: 'status-v1',
        schema: enumSchema,
      });

      const validRaw = await tool.execute(
        { content: '{"status":"running"}' },
        toolOpts,
      );
      expect(parseResult(validRaw)).toMatchObject({
        valid: true,
        schemaId: 'status-v1',
      });

      const invalidRaw = await tool.execute(
        { content: '{"status":"failed"}' },
        toolOpts,
      );
      const invalidResult = parseResult(invalidRaw);

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/status',
            keyword: 'enum',
          }),
        ]),
      );
    });

    it('collapses anyOf branch cascades to the branch selected by a const discriminator', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'object',
          properties: {
            item: {
              anyOf: [
                {
                  type: 'object',
                  required: ['kind', 'a'],
                  properties: {
                    kind: { const: 'alpha' },
                    a: { type: 'string' },
                  },
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  required: ['kind', 'b'],
                  properties: {
                    kind: { const: 'beta' },
                    b: { type: 'number' },
                  },
                  additionalProperties: false,
                },
              ],
            },
          },
        },
      });

      const raw = await tool.execute(
        { content: JSON.stringify({ item: { kind: 'alpha', b: 'bad' } }) },
        toolOpts,
      );
      const result = parseResult(raw);
      const errors = result.errors ?? [];

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/item/a',
            keyword: 'required',
          }),
          expect.objectContaining({
            path: '/item',
            keyword: 'anyOf',
          }),
        ]),
      );
      expect(errors.some((error) =>
        error.schemaPath?.includes('/anyOf/1/')
      )).toBe(false);
    });

    it('collapses anyOf branch cascades to the branch with the fewest errors', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'object',
          properties: {
            item: {
              anyOf: [
                {
                  type: 'object',
                  required: ['a'],
                  properties: { a: { type: 'string' } },
                },
                {
                  type: 'object',
                  required: ['b', 'c'],
                  properties: {
                    b: { type: 'string' },
                    c: { type: 'string' },
                  },
                },
              ],
            },
          },
        },
      });

      const raw = await tool.execute(
        { content: JSON.stringify({ item: {} }) },
        toolOpts,
      );
      const result = parseResult(raw);
      const paths = result.errors?.map((error) => error.path) ?? [];

      expect(paths).toContain('/item/a');
      expect(paths).toContain('/item');
      expect(paths).not.toContain('/item/b');
      expect(paths).not.toContain('/item/c');
    });

    it('auto-enables Ajv discriminator support when a schema declares one next to oneOf', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'object',
          properties: {
            item: {
              discriminator: { propertyName: 'kind' },
              oneOf: [
                {
                  type: 'object',
                  required: ['kind', 'a'],
                  properties: {
                    kind: { const: 'alpha' },
                    a: { type: 'string' },
                  },
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  required: ['kind', 'b'],
                  properties: {
                    kind: { const: 'beta' },
                    b: { type: 'number' },
                  },
                  additionalProperties: false,
                },
              ],
            },
          },
        },
      });

      const raw = await tool.execute(
        { content: JSON.stringify({ item: { kind: 'alpha', b: 'bad' } }) },
        toolOpts,
      );
      const result = parseResult(raw);
      const errors = result.errors ?? [];

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/item/a',
            keyword: 'required',
          }),
        ]),
      );
      expect(errors.some((error) => error.keyword === 'oneOf')).toBe(false);
      expect(errors.some((error) =>
        error.schemaPath?.includes('/oneOf/1/')
      )).toBe(false);
    });

    it('falls back to normal oneOf validation when auto-discriminator compilation fails', async () => {
      const discriminatorSchema: JsonSchema = {
        type: 'object',
        discriminator: { propertyName: 'kind' },
        oneOf: [
          {
            type: 'object',
            required: ['a'],
            properties: {
              kind: { const: 'alpha' },
              a: { type: 'string' },
            },
          },
          {
            type: 'object',
            required: ['b'],
            properties: {
              kind: { const: 'beta' },
              b: { type: 'string' },
            },
          },
        ],
      };
      const tool = createOutputValidator({ schema: discriminatorSchema });

      const raw = await tool.execute(
        { content: JSON.stringify({ kind: 'alpha', a: 'ok' }) },
        toolOpts,
      );

      expect(parseResult(raw)).toMatchObject({ valid: true });
    });

    it('deduplicates to the first error per formatted path by default', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              pattern: '^[A-Z]+$',
            },
          },
        },
      });

      const raw = await tool.execute(
        { content: JSON.stringify({ name: '' }) },
        toolOpts,
      );
      const result = parseResult(raw);
      const nameErrors = result.errors?.filter(({ path }) => path === '/name');

      expect(nameErrors).toHaveLength(1);
    });

    it('keeps separate missing-property errors because required paths are formatted', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'object',
          required: ['a', 'b'],
          properties: {
            a: { type: 'string' },
            b: { type: 'string' },
          },
        },
      });

      const raw = await tool.execute({ content: '{}' }, toolOpts);
      const result = parseResult(raw);
      const paths = result.errors?.map((error) => error.path) ?? [];

      expect(paths).toContain('/a');
      expect(paths).toContain('/b');
    });

    it('supports all and first error modes', async () => {
      const noisySchema: JsonSchema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 2,
            pattern: '^[A-Z]+$',
          },
        },
      };
      const allTool = createOutputValidator({
        schema: noisySchema,
        errorMode: 'all',
      });
      const firstTool = createOutputValidator({
        schema: noisySchema,
        errorMode: 'first',
      });

      const allRaw = await allTool.execute(
        { content: JSON.stringify({ name: '' }) },
        toolOpts,
      );
      const firstRaw = await firstTool.execute(
        { content: JSON.stringify({ name: '' }) },
        toolOpts,
      );

      expect(parseResult(allRaw).errors?.filter(({ path }) =>
        path === '/name'
      )).toHaveLength(2);
      expect(parseResult(firstRaw).errors).toHaveLength(1);
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

    it('returns a corrective error when the tool call omits content', async () => {
      const tool = createOutputValidator({ schemaId: 'answer-v1', schema });
      const parsedInput = tool.inputSchema.safeParse({});
      expect(parsedInput.success).toBe(true);
      if (!parsedInput.success) {
        throw new Error(parsedInput.error.message);
      }

      const raw = await tool.execute(parsedInput.data, toolOpts);
      const result = parseResult(raw);

      expect(result).toMatchObject({
        valid: false,
        schemaId: 'answer-v1',
        message: expect.stringContaining('content string'),
      });
      expect(result.errors).toEqual([
        expect.objectContaining({
          path: '/content',
          keyword: 'required',
          message: expect.stringContaining('output_validator'),
        }),
      ]);
    });

    it('returns a corrective error when content is not a string', async () => {
      const tool = createOutputValidator({ schemaId: 'answer-v1', schema });
      const raw = await tool.execute({ content: 123 } as never, toolOpts);
      const result = parseResult(raw);

      expect(result).toMatchObject({
        valid: false,
        schemaId: 'answer-v1',
        message: expect.stringContaining('content string'),
      });
      expect(result.errors).toEqual([
        expect.objectContaining({
          path: '/content',
          keyword: 'type',
        }),
      ]);
    });

    it('returns a corrective error when content is blank', async () => {
      const tool = createOutputValidator({ schemaId: 'answer-v1', schema });
      const raw = await tool.execute({ content: '   ' }, toolOpts);
      const result = parseResult(raw);

      expect(result).toMatchObject({
        valid: false,
        schemaId: 'answer-v1',
        message: expect.stringContaining('content string'),
      });
      expect(result.errors).toEqual([
        expect.objectContaining({
          path: '/content',
          keyword: 'minLength',
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

    it('uses schema title as the schema id when schemaId is omitted', async () => {
      const tool = createOutputValidator({
        schema: {
          title: 'answer-title',
          type: 'object',
        },
      });
      const raw = await tool.execute({ content: '{}' }, toolOpts);

      expect(parseResult(raw)).toMatchObject({
        valid: true,
        schemaId: 'answer-title',
      });
    });

    it('formats nested required-property paths as JSON pointers', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'object',
          required: ['parent'],
          properties: {
            parent: {
              type: 'object',
              required: ['a/b~c'],
              properties: {
                'a/b~c': { type: 'string' },
              },
            },
          },
        },
      });
      const raw = await tool.execute(
        { content: '{"parent":{}}' },
        toolOpts,
      );

      expect(parseResult(raw).errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/parent/a~1b~0c',
            keyword: 'required',
          }),
        ]),
      );
    });

    it('validates boolean schemas without a schema label', async () => {
      const tool = createOutputValidator({ schema: true });
      const raw = await tool.execute({ content: '123' }, toolOpts);
      const result = parseResult(raw);

      expect(result.valid).toBe(true);
      expect(result.schemaId).toBeUndefined();
      expect(result.schemaHash).toMatch(/^[a-f0-9]{12}$/);
    });

    it('adds schema required fields and examples to the generated tool description', () => {
      const tool = createOutputValidator({
        schemaId: 'answer-v1',
        schema,
        example: { answer: 'yes', confidence: 0.9 },
      });

      expect(tool.description).toContain(
        'Top-level required properties: answer, confidence.',
      );
      expect(tool.description).toContain(
        'Example valid output: {"answer":"yes","confidence":0.9}.',
      );
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

    it('returns an error and omits the hash when schema hashing fails', async () => {
      const circular: Record<string, unknown> = { type: 'object' };
      circular.self = circular;
      const tool = createOutputValidator({
        schema: circular as unknown as JsonSchema,
      });
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

    it('respects explicit Ajv discriminator configuration errors', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'object',
          discriminator: { propertyName: 'kind' },
          oneOf: [
            {
              type: 'object',
              required: ['a'],
              properties: {
                kind: { const: 'alpha' },
                a: { type: 'string' },
              },
            },
            {
              type: 'object',
              required: ['b'],
              properties: {
                kind: { const: 'beta' },
                b: { type: 'string' },
              },
            },
          ],
        },
        ajvOptions: { discriminator: true },
      });
      const raw = await tool.execute(
        { content: JSON.stringify({ kind: 'alpha', a: 'ok' }) },
        toolOpts,
      );

      expect(raw).toContain('Invalid configured schema');
      expect(raw).toContain('discriminator');
    });

    it('returns an error when schema validation throws at runtime', async () => {
      const tool = createOutputValidator({
        schema: {
          type: 'string',
          format: 'throws-at-runtime',
        },
        ajvOptions: {
          formats: {
            'throws-at-runtime': {
              type: 'string',
              validate: () => {
                throw new Error('format boom');
              },
            },
          },
        },
      });

      const raw = await tool.execute({ content: '"value"' }, toolOpts);

      expect(raw).toContain('Error [output-validator]: format boom');
    });
  });
});
