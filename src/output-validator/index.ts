import { Ajv } from 'ajv';
import { tool } from 'ai';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { extractErrorMessage } from '../shared/errors.js';
import { getPrompt } from './prompt.js';

export { getPrompt as outputValidatorPrompt } from './prompt.js';

export type JsonSchemaValue =
  | string
  | number
  | boolean
  | null
  | JsonSchemaObject
  | JsonSchemaValue[];

export interface JsonSchemaObject {
  [key: string]: JsonSchemaValue | undefined;
}

export type JsonSchema = boolean | JsonSchemaObject;

export interface OutputValidatorConfig {
  /**
   * JSON Schema used to validate the final output content.
   * Bind a fresh schema per turn when the expected output shape changes.
   */
  schema?: JsonSchema;
  /** Stable identifier included in validation results for debugging. */
  schemaId?: string;
  /** Ajv options used by the validator. */
  ajvOptions?: Record<string, unknown>;
  /** Override the default tool description. */
  description?: string;
}

export interface OutputValidationError {
  path: string;
  message: string;
  keyword: string;
  schemaPath?: string;
  params?: Record<string, unknown>;
}

export interface OutputValidationResult {
  valid: boolean;
  schemaId?: string;
  schemaHash?: string;
  message?: string;
  errors?: OutputValidationError[];
}

/**
 * Creates an output validator tool with a JSON Schema bound at creation time.
 *
 * The model only supplies the drafted final JSON response content. The schema
 * stays under application control, which prevents an old or model-supplied
 * schema from changing the validation contract during a turn.
 *
 * @param config - Validator configuration with the current turn's schema.
 * @returns A Vercel AI SDK tool that validates final JSON output content.
 *
 * @example
 * ```typescript
 * import { createOutputValidator } from 'agentool/output-validator';
 *
 * const outputValidator = createOutputValidator({
 *   schemaId: 'answer-v1',
 *   schema: {
 *     type: 'object',
 *     additionalProperties: false,
 *     required: ['answer'],
 *     properties: { answer: { type: 'string' } },
 *   },
 * });
 * ```
 */
export function createOutputValidator(config: OutputValidatorConfig = {}) {
  const schemaHash = getSchemaHash(config.schema);
  const schemaId = config.schemaId ?? getSchemaLabel(config.schema);
  const compiled = compileSchema(config);

  return tool({
    description: config.description ?? getPrompt({ schemaId }),
    inputSchema: z.object({
      content: z
        .string()
        .describe('Exact final JSON response text to validate'),
    }),
    execute: async ({ content }) => {
      try {
        if (config.schema === undefined) {
          return 'Error [output-validator]: No schema configured. Provide a schema via createOutputValidator({ schema }).';
        }

        if ('error' in compiled) {
          return `Error [output-validator]: Invalid configured schema: ${compiled.error}`;
        }

        const parsed = parseJsonContent(content, schemaId, schemaHash);
        if (!parsed.ok) {
          return stringifyResult(parsed.result);
        }

        const valid = compiled.validate(parsed.value);
        if (valid) {
          return stringifyResult({
            valid: true,
            schemaId,
            schemaHash,
            message: 'Output matches the configured schema.',
          });
        }

        return stringifyResult({
          valid: false,
          schemaId,
          schemaHash,
          errors: formatAjvErrors(compiled.validate.errors),
        });
      } catch (error: unknown) {
        const msg = extractErrorMessage(error);
        return `Error [output-validator]: ${msg}`;
      }
    },
  });
}

/**
 * Default validator instance. Configure a schema with createOutputValidator()
 * for normal use.
 */
export const outputValidator = createOutputValidator();

type CompileResult =
  | { validate: Validator; error?: never }
  | { validate?: never; error: string };

type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; result: OutputValidationResult };

function compileSchema(config: OutputValidatorConfig): CompileResult {
  if (config.schema === undefined) {
    return { error: 'No schema configured.' };
  }

  try {
    const ajvOptions = config.ajvOptions as AjvOptions | undefined;
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      ...ajvOptions,
    });
    const validate = ajv.compile<unknown>(config.schema) as Validator;
    if (validate.$async === true) {
      return { error: 'Async JSON Schemas are not supported.' };
    }
    return { validate };
  } catch (error: unknown) {
    return { error: extractErrorMessage(error) };
  }
}

function parseJsonContent(
  content: string,
  schemaId: string | undefined,
  schemaHash: string | undefined,
): ParseResult {
  try {
    return { ok: true, value: JSON.parse(content) as unknown };
  } catch (error: unknown) {
    const msg = extractErrorMessage(error);
    return {
      ok: false,
      result: {
        valid: false,
        schemaId,
        schemaHash,
        errors: [
          {
            path: '/',
            message: `Content is not valid JSON: ${msg}`,
            keyword: 'parse',
          },
        ],
      },
    };
  }
}

function formatAjvErrors(
  errors: AjvValidationError[] | null | undefined,
): OutputValidationError[] {
  return (errors ?? []).map((error) => ({
    path: getErrorPath(error),
    message: error.message ?? `failed schema keyword "${error.keyword}"`,
    keyword: error.keyword,
    schemaPath: error.schemaPath,
    params: error.params,
  }));
}

function getErrorPath(error: AjvValidationError): string {
  if (error.keyword === 'required') {
    const missing = getMissingProperty(error.params);
    if (missing) {
      return appendJsonPointer(error.instancePath, missing);
    }
  }

  return error.instancePath || '/';
}

function getMissingProperty(params: Record<string, unknown>): string | undefined {
  const missing = params.missingProperty;
  return typeof missing === 'string' && missing.length > 0
    ? missing
    : undefined;
}

function appendJsonPointer(base: string, segment: string): string {
  const prefix = base && base !== '/' ? base : '';
  return `${prefix}/${escapeJsonPointerSegment(segment)}`;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function getSchemaLabel(schema: JsonSchema | undefined): string | undefined {
  if (!isRecord(schema)) {
    return undefined;
  }

  for (const key of ['$id', 'id', 'title']) {
    const value = schema[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function getSchemaHash(schema: JsonSchema | undefined): string | undefined {
  if (schema === undefined) {
    return undefined;
  }

  try {
    return createHash('sha256')
      .update(JSON.stringify(schema))
      .digest('hex')
      .slice(0, 12);
  } catch {
    return undefined;
  }
}

function stringifyResult(result: OutputValidationResult): string {
  return JSON.stringify(result, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type AjvOptions = ConstructorParameters<typeof Ajv>[0];

interface Validator {
  (data: unknown): boolean;
  $async?: boolean;
  errors?: AjvValidationError[] | null;
}

interface AjvValidationError {
  keyword: string;
  instancePath: string;
  schemaPath?: string;
  params: Record<string, unknown>;
  message?: string;
}
