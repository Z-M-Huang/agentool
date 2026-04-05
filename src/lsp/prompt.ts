/**
 * Generate the description prompt for the LSP tool.
 *
 * @returns The full description string for the LSP tool.
 */
export function getPrompt(): string {
  return `Interact with Language Server Protocol (LSP) servers to get code intelligence features.

## Supported Operations
- **goToDefinition**: Find where a symbol is defined
- **findReferences**: Find all references to a symbol
- **hover**: Get hover information (documentation, type info) for a symbol
- **documentSymbol**: Get all symbols (functions, classes, variables) in a document
- **workspaceSymbol**: Search for symbols across the entire workspace
- **goToImplementation**: Find implementations of an interface or abstract method
- **prepareCallHierarchy**: Get call hierarchy item at a position
- **incomingCalls**: Find all functions/methods that call the function at a position
- **outgoingCalls**: Find all functions/methods called by the function at a position

## When to Use
- To navigate code: find definitions, references, implementations
- To understand code structure: list symbols in a file or workspace
- To analyze call graphs: trace incoming/outgoing calls

## Usage Guidelines
- All operations require \`filePath\`, \`line\`, and \`character\` parameters
- Line and character are **1-based** (as shown in editors), not 0-based
- An LSP server must be configured for the file's language via \`servers\` config
- Operations that don't need a position (documentSymbol, workspaceSymbol) still require filePath`;
}
