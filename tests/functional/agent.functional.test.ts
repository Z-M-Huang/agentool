import { describe, it, expect } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { createAgent } from '../../src/agent/index.js';
import { hasApiConfig, collectToolResults } from './setup.js';

const toolOpts = { toolCallId: 'functional-agent', messages: [] as never[] };

function extractTaskId(output: string): string {
  const match = output.match(/agent_[0-9a-f-]+/);
  if (!match) throw new Error(`No task id found in output: ${output}`);
  return match[0];
}

describe.skipIf(!hasApiConfig)('functional: agent tool', () => {
  const provider = createOpenAI({
    baseURL: process.env.TEST_API_BASE_URL,
    apiKey: process.env.TEST_API_KEY,
  });
  const model = provider(process.env.TEST_MODEL!);

  it('runs a real child model through start and wait', async () => {
    const agent = createAgent({
      model,
      defaultTimeoutMs: 45_000,
      defaultWaitTimeoutMs: 45_000,
      settings: { temperature: 0 },
      agents: {
        direct: {
          systemPrompt:
            'Return exactly DIRECT_AGENT_FUNCTIONAL_OK. Do not add other text.',
        },
      },
      defaultAgent: 'direct',
    });

    const start = await agent.execute(
      {
        action: 'start',
        prompt: 'Return exactly DIRECT_AGENT_FUNCTIONAL_OK.',
      },
      toolOpts,
    );
    const taskId = extractTaskId(start);
    const wait = await agent.execute(
      {
        action: 'wait',
        taskIds: [taskId],
        mode: 'all',
        timeoutMs: 45_000,
        pollIntervalMs: 250,
      },
      toolOpts,
    );

    expect(wait).toContain('Wait complete');
    expect(wait).toContain('DIRECT_AGENT_FUNCTIONAL_OK');
  }, 60_000);

  it('lets a real orchestrator start and wait for a subagent', async () => {
    const agent = createAgent({
      model,
      defaultTimeoutMs: 60_000,
      defaultWaitTimeoutMs: 60_000,
      settings: { temperature: 0 },
      agents: {
        reporter: {
          systemPrompt:
            'Return exactly ORCHESTRATED_AGENT_FUNCTIONAL_OK. Do not add other text.',
        },
      },
      defaultAgent: 'reporter',
    });

    const { steps } = await generateText({
      model,
      tools: { agent },
      stopWhen: stepCountIs(3),
      prompt: `Use the agent tool in sequence.
You must call the agent tool. Do not answer directly.
First call action "start" with agent "reporter" and prompt "Return exactly ORCHESTRATED_AGENT_FUNCTIONAL_OK."
After the start tool result gives a task id, call action "wait" with that task id, mode "all", and timeoutMs 60000.`,
    });

    const results = collectToolResults(steps);
    expect(results).toContain('Started subagent task');
    expect(results).toContain('Wait complete');
    expect(results).toContain('ORCHESTRATED_AGENT_FUNCTIONAL_OK');
  }, 90_000);

  it('does not expose nested agent tools to a real child model', async () => {
    const delegate = createAgent({
      model,
      settings: { temperature: 0 },
      agents: {
        nested: {
          systemPrompt:
            'Return exactly NESTED_AGENT_SHOULD_NOT_RUN. Do not add other text.',
        },
      },
      defaultAgent: 'nested',
    });
    const agent = createAgent({
      model,
      tools: { delegate },
      defaultTimeoutMs: 45_000,
      defaultWaitTimeoutMs: 45_000,
      settings: { temperature: 0 },
      agents: {
        isolated: {
          systemPrompt: `If a delegate tool is available, call it.
If no delegate tool is available, return exactly NO_DELEGATE_TOOL.`,
        },
      },
      defaultAgent: 'isolated',
    });

    const start = await agent.execute(
      {
        action: 'start',
        prompt:
          'Follow your system instruction. Return exactly NO_DELEGATE_TOOL if no delegate tool is available.',
      },
      toolOpts,
    );
    const taskId = extractTaskId(start);
    const wait = await agent.execute(
      {
        action: 'wait',
        taskIds: [taskId],
        mode: 'all',
        timeoutMs: 45_000,
        pollIntervalMs: 250,
      },
      toolOpts,
    );

    expect(wait).toContain('Wait complete');
    expect(wait).toContain('NO_DELEGATE_TOOL');
    expect(wait).not.toContain('NESTED_AGENT_SHOULD_NOT_RUN');
  }, 60_000);
});
