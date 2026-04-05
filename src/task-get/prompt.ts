/**
 * Generate the description prompt for the task-get tool.
 *
 * @returns The full description string for the task-get tool.
 */
export function getPrompt(): string {
  return `Retrieve a task by its ID to see full details including description, dependencies, and metadata.

## When to Use
- Before starting work on a task — read the full description and requirements
- To check a task's dependencies (what it blocks, what blocks it)
- To verify a task's current status before updating it
- When you need more detail than the task list summary provides

## Output
Returns full task details:
- **id**, **subject**, **description**, **status**
- **owner**: Who is assigned (if set)
- **activeForm**: Present continuous label (if set)
- **blocks**: Tasks waiting on this one to complete
- **blockedBy**: Tasks that must complete before this one can start
- **metadata**: Attached key-value data
- **createdAt**, **updatedAt**: Timestamps

## Tips
- Always verify a task's \`blockedBy\` list is empty before beginning work on it
- Use the task list tool to see all tasks in summary form, then this tool for details on specific ones`;
}
