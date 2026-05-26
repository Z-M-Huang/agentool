import type { OutputValidatorConfig } from './index.js';

/**
 * Generate the description prompt for the output-validator tool.
 *
 * @param config - The same config passed to {@link createOutputValidator}.
 * @returns The full description string for the output-validator tool.
 */
export function getPrompt(
  config: Pick<OutputValidatorConfig, 'schemaId' | 'schema' | 'example'> = {},
): string {
  const schemaLine = config.schemaId
    ? `Configured schema id: ${config.schemaId}.`
    : 'The schema is configured by the application when this tool is created.';
  const detailLines = [
    getRequiredPropertiesLine(config.schema),
    getExampleLine(config.example),
  ].filter((line): line is string => line !== undefined);
  const schemaDetails = detailLines.length > 0
    ? `\n${detailLines.join('\n')}\n`
    : '';

  return `Validate the exact final JSON response content against the configured output schema.

${schemaLine}
${schemaDetails}

## When to Use
- Before returning a final answer that must match a structured JSON output contract
- After drafting the complete final JSON response, with the exact response text as the content
- Again after fixing any validation errors returned by this tool

## Usage Guidelines
- Call this tool before the final answer whenever structured output validation is required for the current turn.
- Pass exactly one argument object with the exact final JSON response text in the content parameter: {"content":"<full JSON document as a string>"}.
- Do not call this tool with {}, and do not put the JSON document outside the content parameter.
- If validation fails, revise the response to address every returned error and validate again.
- Only return the final answer after this tool reports valid: true.
- The configured schema may change between turns, so rely on the current tool instance and result schema id/hash.`;
}

function getRequiredPropertiesLine(
  schema: OutputValidatorConfig['schema'],
): string | undefined {
  if (!isRecord(schema) || !Array.isArray(schema.required)) {
    return undefined;
  }

  const required = schema.required.filter((property): property is string =>
    typeof property === 'string' && property.length > 0
  );
  return required.length > 0
    ? `Top-level required properties: ${required.join(', ')}.`
    : undefined;
}

function getExampleLine(
  example: OutputValidatorConfig['example'],
): string | undefined {
  if (example === undefined) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(example);
    if (serialized === undefined) {
      return undefined;
    }
    return `Example valid output: ${truncate(serialized, 500)}.`;
  } catch {
    return undefined;
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 3)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
