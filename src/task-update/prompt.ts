/**
 * Generate the description prompt for the task-update tool.
 *
 * @returns The full description string for the task-update tool.
 */
export function getPrompt(): string {
  return `Update a task by its ID. Can change status, subject, description, owner, metadata, and dependency relationships.

## When to Use

**Marking tasks as completed:**
- When you have fully completed the work described in a task
- ONLY mark a task as completed when the work is truly done
- If you encounter errors or blockers, keep the task as \`in_progress\`
- Never mark a task as completed if:
  - Tests are failing
  - Implementation is partial
  - You encountered unresolved errors

**Marking tasks as in progress:**
- When you begin working on a task, set it to \`in_progress\` immediately

**Deleting tasks:**
- When a task is no longer relevant or was created in error
- Setting status to \`deleted\` permanently removes the task from the list

**Updating details:**
- When requirements change or become clearer
- When establishing dependencies between tasks

## Status Workflow
Status progresses: \`pending\` → \`in_progress\` → \`completed\`
Use \`deleted\` to remove a task permanently.

## Fields You Can Update
- **status**: pending, in_progress, completed, or deleted
- **subject**: Change the task title
- **description**: Change the task description
- **owner**: Assign or reassign the task
- **activeForm**: Present continuous form shown when in_progress (e.g., "Running tests")
- **addBlocks**: Add task IDs that cannot start until this task completes
- **addBlockedBy**: Add task IDs that must complete before this task can start
- **metadata**: Merge key-value pairs into the task (set a key to null to delete it)

## Tips
- After completing a task, check the task list for newly unblocked work
- Use dependencies (blocks/blockedBy) to enforce execution order when tasks depend on each other`;
}
