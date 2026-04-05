import { config } from 'dotenv';
config();

export const hasApiConfig = !!(
  process.env.TEST_API_BASE_URL &&
  process.env.TEST_API_KEY &&
  process.env.TEST_MODEL
);

/**
 * Collect all tool result strings from generateText steps.
 * `toolResults` on the response only has the last step's results,
 * which is empty when the model generates text after the tool call.
 * Each tool result has an `output` property (not `result`).
 */
export function collectToolResults(steps: Array<{ toolResults: Array<{ output: unknown }> }>): string {
  return steps
    .flatMap(s => s.toolResults)
    .map(r => String(r.output))
    .join('\n');
}
