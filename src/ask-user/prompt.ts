/**
 * Generate the description prompt for the ask-user tool.
 *
 * @returns The full description string for the ask-user tool.
 */
export function getPrompt(): string {
  return `Ask the user a question and wait for their response. Pauses execution until the user replies.

Requires an onQuestion callback to be configured — the application provides the user interaction mechanism.

## When to Use
- When you need clarification about ambiguous requirements before proceeding
- When you need the user to choose between multiple valid approaches
- When you need confirmation before taking a potentially destructive action
- When missing critical information that cannot be reasonably inferred

## When NOT to Use
- When you can make a reasonable decision autonomously
- For trivial confirmations that slow down workflow
- When the answer is clearly implied by the user's request

## Usage Guidelines
- Ask clear, specific questions — avoid vague or overly broad queries
- Provide options when there are a small number of valid choices
- Batch related questions together rather than asking one at a time
- Prefer making progress autonomously when the right course of action is clear`;
}
