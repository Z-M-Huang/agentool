/**
 * Generate the description prompt for the memory tool.
 *
 * @returns The full description string for the memory tool.
 */
export function getPrompt(): string {
  return `File-based key-value memory store for persisting notes, context, or any text data across conversations.

Entries are stored as individual .md files in the memory directory.

## Operations
- **write**: Store content under a key (creates or overwrites)
- **read**: Retrieve content by key
- **list**: List all stored keys
- **delete**: Remove a key and its content

## When to Use
- To persist information that should survive across conversations or sessions
- To store user preferences, project notes, or context summaries
- To keep a running log of decisions, findings, or important details

## When NOT to Use
- For temporary data within a single conversation — just keep it in context
- For structured task tracking — use the task management tools instead

## Usage Guidelines
- Keys are sanitized to prevent path traversal (no ../ allowed)
- The \`key\` parameter is required for read, write, and delete operations
- The \`content\` parameter is required for write operations
- Use descriptive key names for easy discovery (e.g., "user-preferences", "project-architecture")`;
}
