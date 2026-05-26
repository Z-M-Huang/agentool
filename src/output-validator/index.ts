import { Ajv } from 'ajv';
import { tool } from 'ai';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { extractErrorMessage } from '../shared/errors.js';
import {
  getContentInput,
  invalidToolInputFallback,
  parseJsonContent,
  type OutputValidatorToolInput,
} from './content.js';
import { formatAjvErrors, type AjvValidationError } from './errors.js';
import { isRecord } from './json-pointer.js';
import { getPrompt } from './prompt.js';
import { hasOneOfDiscriminator } from './schema.js';

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
  /** Controls how many validation errors are returned. */
  errorMode?: OutputValidatorErrorMode;
  /** Minimal valid output example appended to the tool description. */
  example?: JsonSchemaValue;
}

export type OutputValidatorErrorMode = 'all' | 'first-per-path' | 'first';

export interface OutputValidationError {
  path: string;
  message: string;
  keyword: string;
  instanceValue?: string;
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
    description: config.description ?? getPrompt({
      schemaId,
      schema: config.schema,
      example: config.example,
    }),
    inputSchema: z
      .object({
        content: z
          .string()
          .min(1)
          .describe('Exact final JSON response text to validate'),
      })
      .catch(invalidToolInputFallback),
    execute: async (input) => {
      try {
        if (config.schema === undefined) {
          return 'Error [output-validator]: No schema configured. Provide a schema via createOutputValidator({ schema }).';
        }

        if ('error' in compiled) {
          return `Error [output-validator]: Invalid configured schema: ${compiled.error}`;
        }

        const contentInput = getContentInput(
          input as OutputValidatorToolInput,
          schemaId,
          schemaHash,
        );
        if (!contentInput.ok) {
          return stringifyResult(contentInput.result);
        }

        const parsed = parseJsonContent(
          contentInput.content,
          schemaId,
          schemaHash,
        );
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
          message:
            'Output does not match the configured schema. Revise the JSON to address every error, then call output_validator again with the corrected full JSON document as the content string.',
          errors: formatAjvErrors(compiled.validate.errors, {
            data: parsed.value,
            schema: config.schema,
            errorMode: config.errorMode ?? 'first-per-path',
          }),
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

function compileSchema(config: OutputValidatorConfig): CompileResult {
  if (config.schema === undefined) {
    return { error: 'No schema configured.' };
  }

  const ajvOptions = config.ajvOptions as AjvOptions | undefined;
  const autoEnableDiscriminator =
    !hasOwnProperty(ajvOptions, 'discriminator') &&
    hasOneOfDiscriminator(config.schema);
  const primary = compileWithAjv(config.schema, {
    ...(autoEnableDiscriminator ? { discriminator: true } : {}),
    ...ajvOptions,
  });

  if (!('error' in primary) || !autoEnableDiscriminator) {
    return primary;
  }

  return compileWithAjv(config.schema, ajvOptions);
}

function compileWithAjv(
  schema: JsonSchema,
  ajvOptions: AjvOptions | undefined,
): CompileResult {
  try {
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      ...ajvOptions,
    });
    const validate = ajv.compile<unknown>(schema) as Validator;
    return validate.$async === true
      ? { error: 'Async JSON Schemas are not supported.' }
      : { validate };
  } catch (error: unknown) {
    return { error: extractErrorMessage(error) };
  }
}

function hasOwnProperty(
  value: unknown,
  property: string,
): boolean {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, property);
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

type AjvOptions = ConstructorParameters<typeof Ajv>[0];

interface Validator {
  (data: unknown): boolean;
  $async?: boolean;
  errors?: AjvValidationError[] | null;
}
