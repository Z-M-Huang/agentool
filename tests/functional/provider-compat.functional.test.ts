import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  agent,
  askUser,
  bash,
  diff,
  edit,
  glob,
  grep,
  httpRequest,
  lsp,
  memory,
  multiEdit,
  outputValidator,
  read,
  sleep,
  taskCreate,
  taskGet,
  taskList,
  taskUpdate,
  toolSearch,
  webFetch,
  webSearch,
  write,
} from '../../src/index.js';
import { hasApiConfig } from './setup.js';

const allTools = {
  bash,
  grep,
  glob,
  read,
  edit,
  write,
  webFetch,
  memory,
  multiEdit,
  diff,
  taskCreate,
  taskGet,
  taskUpdate,
  taskList,
  webSearch,
  toolSearch,
  lsp,
  httpRequest,
  outputValidator,
  askUser,
  sleep,
  agent,
};

const anthropicApiKey = process.env.TEST_ANTHROPIC_API_KEY;
const anthropicModel = process.env.TEST_ANTHROPIC_MODEL;
const hasAnthropicConfig = !!(anthropicApiKey && anthropicModel);

function schemaOnlyTools(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        providerOptions: tool.providerOptions,
        strict: tool.strict,
      },
    ]),
  ) as ToolSet;
}

async function expectProviderAcceptsAllToolSchemas(model: LanguageModel) {
  const result = await generateText({
    model,
    tools: schemaOnlyTools(allTools),
    maxOutputTokens: 16,
    prompt:
      'Reply exactly TOOL_SCHEMA_COMPAT_OK. Do not call any tools unless required by the API.',
  });

  expect(result.finishReason).toBeDefined();
}

describe.skipIf(!hasApiConfig)('provider compatibility: OpenAI-compatible protocol', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('accepts every exported tool schema in one request', async () => {
    await expectProviderAcceptsAllToolSchemas(model);
  }, 60_000);
});

describe.skipIf(!hasAnthropicConfig)('provider compatibility: Anthropic protocol', () => {
  const provider = createAnthropic({
    apiKey: anthropicApiKey,
    baseURL: process.env.TEST_ANTHROPIC_BASE_URL,
  });
  const model = provider(anthropicModel!);

  it('accepts every exported tool schema in one request', async () => {
    await expectProviderAcceptsAllToolSchemas(model);
  }, 60_000);
});
