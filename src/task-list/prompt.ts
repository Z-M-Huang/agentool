/**
 * Generate the description prompt for the task-list tool.
 *
 * @returns The full description string for the task-list tool.
 */
export function getPrompt(): string {
  return `List all tasks with their status, owner, and dependencies.

## When to Use
- To see what tasks are available to work on (status: pending, not blocked)
- To check overall progress on the current work
- To find tasks that are blocked and need dependencies resolved
- After completing a task — check for newly unblocked work
- Before creating new tasks — check for duplicates

## Output Format
Returns a summary of each non-deleted task:
- **id**: Task identifier (use with task-get or task-update)
- **status**: pending, in_progress, or completed
- **subject**: Brief description of the task
- **owner**: Who is assigned (if set)
- **blockedBy**: Tasks that must complete before this one can start

## Tips
- Tasks with non-empty \`blockedBy\` lists cannot be started until their dependencies are resolved
- Use task-get with a specific ID to see full details including description and metadata
- After marking a task completed, call this tool to find the next available task`;
}
