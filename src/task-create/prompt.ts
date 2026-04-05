/**
 * Generate the description prompt for the task-create tool.
 *
 * @returns The full description string for the task-create tool.
 */
export function getPrompt(): string {
  return `Create a new task to track work. Tasks are stored as JSON and support status tracking, dependencies, and metadata.

## When to Use
- Complex multi-step tasks requiring 3 or more distinct steps
- Non-trivial work that benefits from progress tracking
- When the user provides a list of things to be done
- After receiving new instructions — capture requirements as tasks immediately
- When planning mode is active — create a task list to track the plan

## When NOT to Use
- Single, straightforward tasks that need no tracking
- Trivial work completable in fewer than 3 simple steps
- Purely conversational or informational requests
If there is only one simple task, just do it directly instead of creating a task for it.

## Task Fields
- **subject**: A brief, actionable title in imperative form (e.g., "Fix authentication bug in login flow")
- **description**: Detailed explanation of what needs to be done
- **metadata** (optional): Arbitrary key-value pairs to attach to the task

All tasks are created with status \`pending\`, empty \`blocks\` and \`blockedBy\` arrays.

## Tips
- Create tasks with clear, specific subjects that describe the desired outcome
- After creating tasks, set up dependencies (blocks/blockedBy) if tasks must run in order
- Check the task list first to avoid creating duplicate tasks
- When starting work on a task, update its status to \`in_progress\` before beginning
- After completing a task, mark it \`completed\` and check for newly unblocked tasks`;
}
