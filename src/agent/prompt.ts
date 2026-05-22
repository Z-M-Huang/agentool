import type { AgentConfig } from './types.js';

export function getPrompt(config: AgentConfig = {}): string {
  const names = Object.keys(config.agents ?? {});
  const registryLine =
    names.length > 0
      ? `Configured agents: ${names.join(', ')}.`
      : 'No named agents are configured; the built-in default agent is used.';

  return `Spawn and manage parallel subagents.

Use this tool when work can be split into focused independent investigations or checks.

${registryLine}

Actions:
- start: launch a subagent in the background and return a task id immediately.
- wait: wait internally for any or all selected tasks to finish.
- status: inspect one task.
- result: read one completed task result.
- list: show known tasks.
- stop: abort a running task.

Guidelines:
- Start multiple independent subagents before waiting when parallel work helps.
- Use wait instead of repeatedly polling status.
- Subagents do not receive this agent tool recursively.
- If a result is incomplete, start a narrower follow-up subagent or investigate directly.
- Stop tasks that are no longer useful.`;
}
