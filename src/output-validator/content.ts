import { extractErrorMessage } from '../shared/errors.js';
import type { OutputValidationResult } from './index.js';

const invalidToolInputMarker = '__agentoolOutputValidatorInvalidInput' as const;

export const invalidToolInputFallback = {
  content: '',
  [invalidToolInputMarker]: true,
};

export interface OutputValidatorToolInput {
  content?: unknown;
  [invalidToolInputMarker]?: true;
}

export type ContentInputResult =
  | { ok: true; content: string }
  | { ok: false; result: OutputValidationResult };

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; result: OutputValidationResult };

export function getContentInput(
  input: OutputValidatorToolInput,
  schemaId: string | undefined,
  schemaHash: string | undefined,
): ContentInputResult {
  if (input[invalidToolInputMarker] === true) {
    return invalidContent(schemaId, schemaHash, 'required',
      'The output_validator tool input must include a non-empty content string. Expected shape: output_validator({"content":"<full JSON document as a string>"}). Do not call output_validator({}).');
  }

  if (typeof input.content !== 'string') {
    return invalidContent(
      schemaId,
      schemaHash,
      input.content === undefined ? 'required' : 'type',
      'The output_validator content parameter must be a string containing the full final JSON document. Expected shape: output_validator({"content":"<full JSON document as a string>"}).',
    );
  }

  if (input.content.trim().length === 0) {
    return invalidContent(schemaId, schemaHash, 'minLength',
      'The output_validator content parameter must not be blank. Pass the full final JSON document as the content string.');
  }

  return { ok: true, content: input.content };
}

export function parseJsonContent(
  content: string,
  schemaId: string | undefined,
  schemaHash: string | undefined,
): ParseResult {
  try {
    return { ok: true, value: JSON.parse(content) as unknown };
  } catch (error: unknown) {
    return {
      ok: false,
      result: {
        valid: false,
        schemaId,
        schemaHash,
        message:
          'Content is not valid JSON. Provide the corrected full JSON document as the content string and validate again.',
        errors: [{
          path: '/',
          message: `Content is not valid JSON: ${extractErrorMessage(error)}`,
          keyword: 'parse',
        }],
      },
    };
  }
}

function invalidContent(
  schemaId: string | undefined,
  schemaHash: string | undefined,
  keyword: string,
  message: string,
): ContentInputResult {
  return {
    ok: false,
    result: {
      valid: false,
      schemaId,
      schemaHash,
      message:
        'The output_validator tool was called without a valid content string. Call it again with the full final JSON document in the content parameter.',
      errors: [{
        path: '/content',
        message,
        keyword,
        params: {
          expected:
            'output_validator({"content":"<full JSON document as a string>"})',
        },
      }],
    },
  };
}
