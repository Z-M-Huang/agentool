import { describe, it, expect } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createToolSearch } from '../../src/tool-search/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

describe.skipIf(!hasApiConfig)('functional: tool-search tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('model searches for tools matching a keyword', async () => {
    const tool = createToolSearch({
      tools: {
        bash: { description: 'Execute shell commands with timeout' },
        grep: { description: 'Search file contents using ripgrep regex' },
        read: { description: 'Read file contents with line numbers' },
        write: { description: 'Write content to a file' },
        edit: { description: 'Replace strings in a file' },
        glob: { description: 'Find files by glob pattern' },
      },
    });
    const opts = {
      model,
      tools: { tool_search: tool },
      prompt: 'Search for tools related to "file"',
      maxSteps: 3,
    };
    const { steps } = await generateText(opts as Parameters<typeof generateText>[0]);
    const results = collectToolResults(steps);
    // Should find tools that mention "file" in name or description
    expect(results.length).toBeGreaterThan(0);
    expect(results).toMatch(/read|write|edit|grep|glob/i);
  });
});
