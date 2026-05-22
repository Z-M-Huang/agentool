import type { ToolSet } from 'ai';

const AGENT_TOOL_NAME = 'agent';
const agentTools = new WeakSet<object>();

export function markAgentTool<T extends object>(agentTool: T): T {
  agentTools.add(agentTool);
  return agentTool;
}

function isMarkedAgentTool(value: unknown): boolean {
  return typeof value === 'object' && value !== null && agentTools.has(value);
}

export function removeAgentTools(tools: ToolSet | undefined): ToolSet | undefined {
  if (!tools) return tools;

  const toolEntries = Object.entries(tools);
  const entries = toolEntries.filter(
    ([name, value]) => name !== AGENT_TOOL_NAME && !isMarkedAgentTool(value),
  );
  if (entries.length === toolEntries.length) return tools;
  if (entries.length === 0) return undefined;

  return Object.fromEntries(entries) as ToolSet;
}
