import { isRecord } from './json-pointer.js';

const DEFAULT_OUTPUT_VALIDATOR_TOOL_NAME = 'output_validator';

export interface OutputValidatorUsageOptions {
  /**
   * Tool name used in the AI SDK tools object.
   * Defaults to output_validator.
   */
  toolName?: string;
}

export interface OutputValidatorTurnLike {
  /** Tool calls from the last turn or step. */
  toolCalls?: unknown;
  /** Multi-step generation results, each with its own toolCalls array. */
  steps?: unknown;
  /** Other AI SDK result fields such as finishReason are ignored. */
  [key: string]: unknown;
}

export type OutputValidatorUsageResult =
  | {
    /** Tool name checked by the helper. */
    toolName: string;
    /** True when a matching validator tool call exists in the turn. */
    wasCalled: true;
    correctivePrompt?: never;
  }
  | {
    /** Tool name checked by the helper. */
    toolName: string;
    /** False when no matching validator tool call exists in the turn. */
    wasCalled: false;
    /** Follow-up instruction for the next LLM interaction. */
    correctivePrompt: string;
  };

/**
 * Inspect an AI SDK result-like object for an output-validator tool call.
 *
 * The check is structural: it looks for matching `toolName` values in
 * top-level `toolCalls` and in each `steps[].toolCalls` array. Use this after
 * a turn finishes with `finishReason: 'stop'` to decide whether to continue
 * with the returned corrective prompt.
 */
export function checkOutputValidatorUsage(
  turn: OutputValidatorTurnLike,
  options: OutputValidatorUsageOptions = {},
): OutputValidatorUsageResult {
  const toolName = getOutputValidatorToolName(options);
  const wasCalled =
    hasToolCallNamed(turn.toolCalls, toolName) ||
    hasStepToolCallNamed(turn.steps, toolName);

  if (wasCalled) {
    return { toolName, wasCalled };
  }

  return {
    toolName,
    wasCalled,
    correctivePrompt: getOutputValidatorCorrectivePrompt(toolName),
  };
}

function getOutputValidatorToolName(
  options: OutputValidatorUsageOptions,
): string {
  const toolName = options.toolName?.trim();
  return toolName && toolName.length > 0
    ? toolName
    : DEFAULT_OUTPUT_VALIDATOR_TOOL_NAME;
}

function hasStepToolCallNamed(steps: unknown, toolName: string): boolean {
  return Array.isArray(steps) && steps.some((step) =>
    isRecord(step) && hasToolCallNamed(step.toolCalls, toolName)
  );
}

function hasToolCallNamed(toolCalls: unknown, toolName: string): boolean {
  return Array.isArray(toolCalls) && toolCalls.some((toolCall) =>
    getToolCallName(toolCall) === toolName
  );
}

function getToolCallName(toolCall: unknown): string | undefined {
  if (!isRecord(toolCall)) {
    return undefined;
  }

  return typeof toolCall.toolName === 'string'
    ? toolCall.toolName
    : undefined;
}

function getOutputValidatorCorrectivePrompt(toolName: string): string {
  return `The previous response ended without validating the final JSON. In the next interaction, call ${toolName}({"content":"<full JSON document as a string>"}) with the complete final JSON document in the content string parameter. Do not return another final answer until that validator call reports valid: true.`;
}
