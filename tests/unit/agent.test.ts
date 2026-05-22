import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from '@ai-sdk/provider';
import { tool as createTool } from 'ai';
import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { agent, createAgent } from '../../src/agent/index.js';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

function textResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: 'stop',
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    warnings: [],
  } as unknown as LanguageModelV3GenerateResult;
}

function makeStubModel(
  generate: (
    opts: LanguageModelV3CallOptions,
  ) => Promise<LanguageModelV3GenerateResult> | LanguageModelV3GenerateResult,
): LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'stub',
    supportedUrls: {},
    async doGenerate(opts: LanguageModelV3CallOptions) {
      return generate(opts);
    },
    async doStream() {
      throw new Error('not implemented');
    },
  } as unknown as LanguageModelV3 as unknown as LanguageModel;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function extractTaskId(output: string): string {
  const match = output.match(/agent_[0-9a-f-]+/);
  if (!match) throw new Error(`No task id found in output: ${output}`);
  return match[0];
}

async function eventually(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

describe('agent tool', () => {
  it('default export exists', () => {
    expect(agent).toBeDefined();
    expect(typeof agent.execute).toBe('function');
    expect(agent.inputSchema).toBeDefined();
    expect(typeof agent.description).toBe('string');
  });

  it('starts a task and returns its result after wait', async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const model = makeStubModel((opts) => {
      calls.push(opts);
      return textResult('explore complete');
    });
    const tool = createAgent({
      model,
      agents: {
        explorer: {
          systemPrompt: 'Registry system prompt',
        },
      },
      defaultAgent: 'explorer',
    });

    const start = await tool.execute(
      { action: 'start', prompt: 'Inspect src/agent', description: 'inspect' },
      {
        toolCallId: 'test',
        messages: [{ role: 'user', content: 'secret-parent-context' }] as never[],
      },
    );
    const taskId = extractTaskId(start);

    const wait = await tool.execute(
      { action: 'wait', taskIds: [taskId], mode: 'all', timeoutMs: 1_000 },
      toolOpts,
    );
    expect(wait).toContain('Wait complete');
    expect(wait).toContain('explore complete');

    const result = await tool.execute({ action: 'result', taskId }, toolOpts);
    expect(result).toContain('Status: completed');
    expect(result).toContain('Result:');
    expect(result).toContain('explore complete');

    const serializedCall = JSON.stringify(calls[0]);
    expect(serializedCall).toContain('Registry system prompt');
    expect(serializedCall).toContain('Inspect src/agent');
    expect(serializedCall).not.toContain('secret-parent-context');
  });

  it('waits for any subagent while others keep running', async () => {
    const first = deferred<LanguageModelV3GenerateResult>();
    const second = deferred<LanguageModelV3GenerateResult>();
    const third = deferred<LanguageModelV3GenerateResult>();
    const pending = [first, second, third];
    const model = makeStubModel(() => {
      const next = pending.shift();
      if (!next) throw new Error('unexpected call');
      return next.promise;
    });
    const tool = createAgent({ model, maxConcurrent: 3 });

    const ids = await Promise.all(
      ['a', 'b', 'c'].map(async (name) =>
        extractTaskId(
          await tool.execute(
            { action: 'start', prompt: `folder ${name}` },
            toolOpts,
          ),
        ),
      ),
    );
    await eventually(() => expect(pending).toHaveLength(0));

    const waitPromise = tool.execute(
      {
        action: 'wait',
        taskIds: ids,
        mode: 'any',
        timeoutMs: 1_000,
        pollIntervalMs: 10,
      },
      toolOpts,
    );
    second.resolve(textResult('folder b done'));
    const waitAny = await waitPromise;
    expect(waitAny).toContain('Wait complete (any)');
    expect(waitAny).toContain('folder b done');
    expect(waitAny).toContain('running');

    first.resolve(textResult('folder a done'));
    third.resolve(textResult('folder c done'));
    const waitAll = await tool.execute(
      {
        action: 'wait',
        taskIds: ids,
        mode: 'all',
        timeoutMs: 1_000,
        pollIntervalMs: 10,
      },
      toolOpts,
    );
    expect(waitAll).toContain('folder a done');
    expect(waitAll).toContain('folder b done');
    expect(waitAll).toContain('folder c done');
  });

  it('enforces maxConcurrent', async () => {
    const pending = deferred<LanguageModelV3GenerateResult>();
    const model = makeStubModel(() => pending.promise);
    const tool = createAgent({ model, maxConcurrent: 1 });

    const first = await tool.execute({ action: 'start', prompt: 'one' }, toolOpts);
    const taskId = extractTaskId(first);
    const second = await tool.execute({ action: 'start', prompt: 'two' }, toolOpts);
    expect(second).toContain('Max concurrent subagents reached');

    await tool.execute({ action: 'stop', taskId }, toolOpts);
    pending.reject(new Error('aborted'));
  });

  it('stops a running task', async () => {
    const model = makeStubModel(
      (opts) =>
        new Promise<LanguageModelV3GenerateResult>((_resolve, reject) => {
          opts.abortSignal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const tool = createAgent({ model });

    const start = await tool.execute(
      { action: 'start', prompt: 'long task' },
      toolOpts,
    );
    const taskId = extractTaskId(start);
    const stop = await tool.execute({ action: 'stop', taskId }, toolOpts);
    expect(stop).toContain('Stopped subagent task');

    const status = await tool.execute({ action: 'status', taskId }, toolOpts);
    expect(status).toContain('Status: stopped');
  });

  it('reports wait timeout without stopping running tasks', async () => {
    const pending = deferred<LanguageModelV3GenerateResult>();
    const model = makeStubModel(() => pending.promise);
    const tool = createAgent({ model });

    const start = await tool.execute(
      { action: 'start', prompt: 'slow task' },
      toolOpts,
    );
    const taskId = extractTaskId(start);
    const wait = await tool.execute(
      {
        action: 'wait',
        taskIds: [taskId],
        mode: 'all',
        timeoutMs: 20,
        pollIntervalMs: 5,
      },
      toolOpts,
    );
    expect(wait).toContain('Wait timed out');
    expect(wait).toContain('running');

    await tool.execute({ action: 'stop', taskId }, toolOpts);
    pending.reject(new Error('aborted'));
  });

  it('removes agent tools from child tools', async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const model = makeStubModel((opts) => {
      calls.push(opts);
      return textResult('done');
    });
    const read = createTool({
      description: 'Read test data',
      inputSchema: z.object({}),
      execute: async () => 'read result',
    });
    const tool = createAgent({
      model,
      tools: {
        read,
        delegate: createAgent({ model }),
      },
    });

    const start = await tool.execute(
      { action: 'start', prompt: 'inspect available tools' },
      toolOpts,
    );
    const taskId = extractTaskId(start);
    await tool.execute(
      { action: 'wait', taskIds: [taskId], timeoutMs: 1_000 },
      toolOpts,
    );

    const serializedCall = JSON.stringify(calls[0]);
    expect(serializedCall).toContain('read');
    expect(serializedCall).not.toContain('"delegate"');
  });
});
