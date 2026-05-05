import type { OutputValidatorConfig } from './index.js';

/**
 * Generate the description prompt for the output-validator tool.
 *
 * @param config - The same config passed to {@link createOutputValidator}.
 * @returns The full description string for the output-validator tool.
 */
export function getPrompt(
  config: Pick<OutputValidatorConfig, 'schemaId'> = {},
): string {
  const schemaLine = config.schemaId
    ? `Configured schema id: ${config.schemaId}.`
    : 'The schema is configured by the application when this tool is created.';

  return `Validate the exact final JSON response content against the configured output schema.

${schemaLine}

## When to Use
- Before returning a final answer that must match a structured JSON output contract
- After drafting the complete final JSON response, with the exact response text as the content
- Again after fixing any validation errors returned by this tool

## Usage Guidelines
- Call this tool before the final answer whenever structured output validation is required for the current turn.
- Pass the exact final JSON response text in the content parameter.
- If validation fails, revise the response to address every returned error and validate again.
- Only return the final answer after this tool reports valid: true.
- The configured schema may change between turns, so rely on the current tool instance and result schema id/hash.`;
}
