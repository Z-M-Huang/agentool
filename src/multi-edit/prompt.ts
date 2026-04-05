/**
 * Generate the description prompt for the multi-edit tool.
 *
 * @returns The full description string for the multi-edit tool.
 */
export function getPrompt(): string {
  return `Atomically apply multiple text edits to a single file. All edits succeed together or none are applied.

Each edit replaces one occurrence of old_string with new_string. Edits are applied sequentially in the order provided.

## When to Use
- When you need to make several related changes to the same file in one operation
- When changes depend on each other and partial application would leave the file in a broken state
- To rename a variable in multiple locations within the same file

## When NOT to Use
- For a single edit — use the regular file editing tool instead (simpler)
- For changes across multiple files — make separate edit calls per file
- For creating new files — use the file writing tool instead

## Usage Guidelines
- If any edit fails (old_string not found or not unique), the entire batch is rolled back — the file stays unchanged
- Each old_string must appear exactly once in the file at the time that edit is applied
- Edits are applied in order, so later edits see the result of earlier ones
- Supports curly-quote fallback matching and quote-style preservation`;
}
