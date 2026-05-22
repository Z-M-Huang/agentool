<div align="center">

# agentool

**23 AI agent tools + context-compaction helper for the [Vercel AI SDK](https://sdk.vercel.ai/).**

  <p>
  <a href="https://www.npmjs.com/package/agentool"><img src="https://img.shields.io/npm/v/agentool?style=flat-square&color=cb3837&logo=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/agentool"><img src="https://img.shields.io/npm/dm/agentool?style=flat-square&color=cb3837&logo=npm" alt="npm downloads" /></a>
  <a href="https://github.com/Z-M-Huang/agentool"><img src="https://img.shields.io/github/stars/Z-M-Huang/agentool?style=flat-square&logo=github" alt="GitHub stars" /></a>
  <a href="https://github.com/Z-M-Huang/agentool/issues"><img src="https://img.shields.io/github/issues/Z-M-Huang/agentool?style=flat-square&logo=github" alt="GitHub issues" /></a>
  <a href="https://github.com/Z-M-Huang/agentool/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Z-M-Huang/agentool?style=flat-square" alt="License" /></a>
  </p>
  <p>
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.7+-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vercel%20AI%20SDK-v5%2B-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel AI SDK" />
  <img src="https://img.shields.io/badge/ESM%20%2B%20CJS-supported-22c55e?style=flat-square" alt="ESM + CJS" />
  <img src="https://img.shields.io/badge/coverage-96%25-brightgreen?style=flat-square" alt="Test Coverage" />
  <img src="https://visitor-badge.laobi.icu/badge?page_id=Z-M-Huang.agentool&style=flat-square" alt="Visitors" />
  </p>
</div>

File operations, shell execution, code search, web fetching, and more -- everything an AI agent needs to interact with a codebase and system.

---

## Features

- **23 production-ready tools** -- bash, grep, glob, read, edit, write, web-fetch, web-search, tool-search, output-validator, memory, multi-edit, diff, task-create, task-get, task-update, task-list, lsp, http-request, ask-user, sleep, agent
- **Context-compaction middleware** -- transparent prompt compaction via `wrapLanguageModel()`, preserves system messages and recent turns
- **Vercel AI SDK compatible** -- works with `generateText()`, `streamText()`, and any AI SDK provider (OpenAI, Anthropic, Google, etc.)
- **Factory + default pattern** -- `createBash({ cwd: '/my/project' })` for custom config, or just use `bash` with zero config
- **Dual ESM/CJS** -- works everywhere with proper `exports` map
- **TypeScript-first** -- full type declarations, strict mode, no `any`
- **Never throws** -- every `execute()` returns a descriptive error string instead of throwing
- **Tree-shakeable** -- 23 subpath exports, only import what you need

## Installation

```bash
npm install agentool ai zod
```

> `ai` and `zod` are peer dependencies. You also need an AI SDK provider like `@ai-sdk/openai`, `@ai-sdk/anthropic`, etc.

### Prerequisites

- **Node.js >= 18**
- **[ripgrep](https://github.com/BurntSushi/ripgrep#installation)** (`rg`) -- required for `grep` and `glob` tools

```bash
# macOS
brew install ripgrep

# Ubuntu/Debian
sudo apt install ripgrep

# Windows
choco install ripgrep
```

## Quick Start

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { bash, read, edit, glob, grep } from 'agentool';

const { text } = await generateText({
  model: openai('gpt-4o'),
  tools: { bash, read, edit, glob, grep },
  maxSteps: 10,
  prompt: 'Find all TypeScript files with TODO comments and list them',
});
```

### Tree-shake with subpath imports

```typescript
// Only import what you need -- no unused code loaded
import { bash } from 'agentool/bash';
import { grep } from 'agentool/grep';
```

### Custom configuration

Use factory functions when you need to configure tools (custom `cwd`, timeouts, etc.):

```typescript
import { createBash } from 'agentool/bash';
import { createRead } from 'agentool/read';

const myBash = createBash({ cwd: '/my/project', timeout: 60000 });
const myRead = createRead({ cwd: '/my/project' });

// Use them like any other tool
const { text } = await generateText({
  model: openai('gpt-4o'),
  tools: { bash: myBash, read: myRead },
  maxSteps: 10,
  prompt: 'List all files and read package.json',
});
```

## Tools Reference

### bash

Execute shell commands with timeout and signal handling.

```typescript
import { bash } from 'agentool/bash';

const result = await bash.execute(
  { command: 'echo hello && ls -la' },
  { toolCallId: 'id', messages: [] },
);
```

With custom config:

```typescript
import { createBash } from 'agentool/bash';

const bash = createBash({
  cwd: '/my/project',
  timeout: 60000,    // 60s timeout (default: 120s)
  shell: '/bin/zsh', // custom shell
});
```

**Parameters:** `command` (string), `timeout?` (number), `description?` (string)

---

### read

Read files with line numbers, offset/limit pagination, and dual-path reading (fast for <10MB, streaming for larger).

```typescript
import { read } from 'agentool/read';

// Read entire file
const content = await read.execute(
  { file_path: '/app/src/index.ts' },
  { toolCallId: 'id', messages: [] },
);
// Returns: "1\texport function hello() {\n2\t  return 'world';\n3\t}"

// Read specific range
const range = await read.execute(
  { file_path: '/app/src/index.ts', offset: 10, limit: 20 },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `file_path` (string), `offset?` (number), `limit?` (number)

---

### edit

Exact string replacement with curly-quote normalization fallback.

```typescript
import { edit } from 'agentool/edit';

const result = await edit.execute(
  {
    file_path: '/app/src/config.ts',
    old_string: 'const PORT = 3000;',
    new_string: 'const PORT = 8080;',
  },
  { toolCallId: 'id', messages: [] },
);

// Replace all occurrences
const resultAll = await edit.execute(
  {
    file_path: '/app/src/config.ts',
    old_string: 'localhost',
    new_string: '0.0.0.0',
    replace_all: true,
  },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `file_path` (string), `old_string` (string), `new_string` (string), `replace_all?` (boolean)

---

### write

Write files with automatic parent directory creation.

```typescript
import { write } from 'agentool/write';

const result = await write.execute(
  {
    file_path: '/app/src/utils/helpers.ts',
    content: 'export function add(a: number, b: number) {\n  return a + b;\n}\n',
  },
  { toolCallId: 'id', messages: [] },
);
// Returns: "Created file: /app/src/utils/helpers.ts (62 bytes)"
```

**Parameters:** `file_path` (string), `content` (string)

---

### grep

Search file contents with ripgrep. Three output modes, context lines, pagination.

```typescript
import { grep } from 'agentool/grep';

// Find matching lines with context
const content = await grep.execute(
  { pattern: 'TODO|FIXME', output_mode: 'content', '-C': 2 },
  { toolCallId: 'id', messages: [] },
);

// List files containing matches (sorted by mtime)
const files = await grep.execute(
  { pattern: 'import.*react', output_mode: 'files_with_matches', glob: '*.tsx' },
  { toolCallId: 'id', messages: [] },
);

// Count matches per file
const counts = await grep.execute(
  { pattern: 'console\\.log', output_mode: 'count' },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `pattern` (string), `path?` (string), `output_mode?` (`'content'` | `'files_with_matches'` | `'count'`), `glob?` (string), `type?` (string), `-i?` (boolean), `-n?` (boolean), `-A?` (number), `-B?` (number), `-C?` / `context?` (number), `head_limit?` (number), `offset?` (number), `multiline?` (boolean)

---

### glob

Find files by pattern with ripgrep, sorted by modification time.

```typescript
import { glob } from 'agentool/glob';

const result = await glob.execute(
  { pattern: '**/*.test.ts' },
  { toolCallId: 'id', messages: [] },
);
// Returns: "Found 27 files\n/app/tests/unit/bash.test.ts\n..."

// Search in specific directory
const result2 = await glob.execute(
  { pattern: '*.json', path: '/app/config' },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `pattern` (string), `path?` (string)

---

### multi-edit

Atomically apply multiple edits to a single file. All succeed or none are applied.

```typescript
import { multiEdit } from 'agentool/multi-edit';

const result = await multiEdit.execute(
  {
    file_path: '/app/src/config.ts',
    edits: [
      { old_string: 'const PORT = 3000;', new_string: 'const PORT = 8080;' },
      { old_string: "const HOST = 'localhost';", new_string: "const HOST = '0.0.0.0';" },
    ],
  },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `file_path` (string), `edits` (array of `{ old_string, new_string }`)

---

### diff

Generate unified diffs between files or strings.

```typescript
import { diff } from 'agentool/diff';

// Compare two files
const fileDiff = await diff.execute(
  { file_path: '/app/old.ts', other_file_path: '/app/new.ts' },
  { toolCallId: 'id', messages: [] },
);

// Compare strings
const stringDiff = await diff.execute(
  { old_content: 'hello world', new_content: 'hello universe' },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `file_path?` (string), `other_file_path?` (string), `old_content?` (string), `new_content?` (string)

---

### web-fetch

Fetch URLs with automatic HTML-to-markdown conversion.

```typescript
import { webFetch } from 'agentool/web-fetch';

const result = await webFetch.execute(
  { url: 'https://example.com' },
  { toolCallId: 'id', messages: [] },
);
// Returns markdown content (HTML converted via Turndown, truncated at 100K chars)
```

**Parameters:** `url` (string, must be valid URL)

---

### web-search

Search the web with a callback-based implementation (bring your own search provider).

```typescript
import { createWebSearch } from 'agentool/web-search';

const webSearch = createWebSearch({
  onSearch: async (query, { allowed_domains, blocked_domains }) => {
    // Use Tavily, SerpAPI, Google, or any search provider
    const results = await mySearchProvider.search(query, { allowed_domains, blocked_domains });
    return results.map(r => `${r.title}: ${r.url}\n${r.snippet}`).join('\n\n');
  },
});

const result = await webSearch.execute(
  { query: 'TypeScript best practices 2024', allowed_domains: ['typescript-eslint.io'] },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `query` (string, min 2 chars), `allowed_domains?` (string[]), `blocked_domains?` (string[])

---

### tool-search

Search through a registry of available tools by name or keyword.

```typescript
import { createToolSearch } from 'agentool/tool-search';

const toolSearch = createToolSearch({
  tools: {
    bash: { description: 'Execute shell commands' },
    grep: { description: 'Search file contents with regex' },
    read: { description: 'Read file contents' },
  },
});

const result = await toolSearch.execute(
  { query: 'file', max_results: 3 },
  { toolCallId: 'id', messages: [] },
);
// Returns matching tools sorted by relevance
```

**Parameters:** `query` (string), `max_results?` (number, default 5)

---

### output-validator

Validate the exact final JSON response against a JSON Schema configured by the application.

```typescript
import { createOutputValidator } from 'agentool/output-validator';

const outputValidator = createOutputValidator({
  schemaId: 'answer-v1',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'confidence'],
    properties: {
      answer: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
  },
});

const result = await outputValidator.execute(
  { content: '{"answer":"Use the validator per turn.","confidence":0.92}' },
  { toolCallId: 'id', messages: [] },
);
// Returns JSON: { "valid": true, "schemaId": "answer-v1", ... }
```

Use a fresh validator instance for the current turn's schema:

```typescript
const tools = {
  output_validator: createOutputValidator({
    schemaId: 'current-turn-output',
    schema: currentTurnSchema,
  }),
};
```

If the schema changes on the next turn, create a new validator and pass it under the same tool name. No new chat session is required as long as your app rebuilds the tool list for that model call.

**Parameters:** `content` (string, exact final JSON response text)

---

### http-request

Make raw HTTP requests without markdown conversion.

```typescript
import { httpRequest } from 'agentool/http-request';

const result = await httpRequest.execute(
  {
    method: 'POST',
    url: 'https://api.example.com/data',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'value' }),
    timeout: 5000,
  },
  { toolCallId: 'id', messages: [] },
);
// Returns JSON: { status, statusText, headers, body }
```

**Parameters:** `method` (`'GET'` | `'POST'` | `'PUT'` | `'PATCH'` | `'DELETE'` | `'HEAD'`), `url` (string), `headers?` (object), `body?` (string), `timeout?` (number)

---

### memory

File-based key-value store for persistent agent memory.

```typescript
import { memory } from 'agentool/memory';

// Write
await memory.execute(
  { action: 'write', key: 'user-prefs', content: 'Prefers dark mode' },
  { toolCallId: 'id', messages: [] },
);

// Read
const data = await memory.execute(
  { action: 'read', key: 'user-prefs' },
  { toolCallId: 'id', messages: [] },
);

// List all keys
const keys = await memory.execute(
  { action: 'list' },
  { toolCallId: 'id', messages: [] },
);

// Delete
await memory.execute(
  { action: 'delete', key: 'user-prefs' },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `action` (`'read'` | `'write'` | `'list'` | `'delete'`), `key?` (string), `content?` (string)

---

### task-create

Create a new task with subject, description, and optional metadata.

```typescript
import { taskCreate } from 'agentool/task-create';

const result = await taskCreate.execute(
  { subject: 'Fix login bug', description: 'Auth fails on refresh', metadata: { priority: 'high' } },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `subject` (string), `description` (string), `metadata?` (Record<string, unknown>)

---

### task-get

Retrieve a task by ID to see full details.

```typescript
import { taskGet } from 'agentool/task-get';

const result = await taskGet.execute(
  { taskId: 'abc123' },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `taskId` (string)

---

### task-update

Update a task's status, owner, metadata, and dependency relationships.

```typescript
import { taskUpdate } from 'agentool/task-update';

// Update status and owner
await taskUpdate.execute(
  { taskId: 'abc123', status: 'in_progress', owner: 'agent-1' },
  { toolCallId: 'id', messages: [] },
);

// Add dependencies and merge metadata (null deletes a key)
await taskUpdate.execute(
  { taskId: 'abc123', addBlockedBy: ['def456'], metadata: { priority: null, notes: 'reviewed' } },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `taskId` (string), `subject?` (string), `description?` (string), `status?` (`'pending'` | `'in_progress'` | `'completed'` | `'deleted'`), `owner?` (string), `activeForm?` (string), `addBlocks?` (string[]), `addBlockedBy?` (string[]), `metadata?` (Record<string, unknown>)

---

### task-list

List all non-deleted tasks with status and dependencies.

```typescript
import { taskList } from 'agentool/task-list';

const result = await taskList.execute(
  {},
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** none

---

### lsp

Language Server Protocol operations for code intelligence.

```typescript
import { createLsp } from 'agentool/lsp';

const lsp = createLsp({
  servers: {
    '.ts': { command: 'typescript-language-server', args: ['--stdio'] },
    '.py': { command: 'pylsp' },
  },
});

const result = await lsp.execute(
  { operation: 'goToDefinition', filePath: 'src/index.ts', line: 10, character: 5 },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `operation` (`'goToDefinition'` | `'findReferences'` | `'hover'` | `'documentSymbol'` | `'workspaceSymbol'` | `'goToImplementation'` | `'prepareCallHierarchy'` | `'incomingCalls'` | `'outgoingCalls'`), `filePath` (string), `line` (number, 1-based), `character` (number, 1-based)

---

### context-compaction (function)

> **Breaking in 1.3.0:** the `createContextCompaction` middleware was removed in favor of a pure `compactMessages` function. The middleware couldn't persist compacted state back to the caller, so every over-threshold turn re-summarized — costly and cache-busting. The function form returns the new messages and the caller assigns it back. See [migration](#migration-from-12x).

`compactMessages` summarizes older conversation history when usage crosses a threshold, preserving the leading system prefix and the most recent turns. It works with any provider the AI SDK supports (OpenAI / Anthropic / Google / Mistral / xAI / etc.) because it operates on the unified `ModelMessage[]` shape.

```typescript
import { compactMessages } from 'agentool/context-compaction';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const model = openai('gpt-5');
let messages: ModelMessage[] = [];

// Each turn:
messages.push({ role: 'user', content: userInput });
messages = await compactMessages({
  messages,
  summaryModel: openai('gpt-5-mini'),  // cheap summarizer (can differ from main model)
  maxContextTokens: 400_000,
});
const result = await generateText({ model, messages });
messages.push(...result.response.messages);
```

When usage is under threshold, `compactMessages` returns the **same `messages` reference** (`===`), so the second-call cost is cheap.

**Output shape after compaction:**
```
[ ...leadingSystemPrefix,
  { role: 'user',      content: <summary> },
  { role: 'assistant', content: 'Understood.' },
  ...lastNMessages ]
```
The synthetic `user → assistant` ack pair preserves role alternation (required by Anthropic / Google providers).

**Tool-chain safety:** the recent-window boundary auto-extends backwards so `tool-call` / `tool-result` / `tool-approval-request` / `tool-approval-response` IDs are never split across the summarization boundary. No `MissingToolResultsError` from the AI SDK.

**Cross-provider example (Anthropic):**
```typescript
import { anthropic } from '@ai-sdk/anthropic';

messages = await compactMessages({
  messages,
  summaryModel: anthropic('claude-sonnet-4-20250514'),
  maxContextTokens: 200_000,
});
```

**Custom summarizer (e.g. local model, cached, or anything else):**
```typescript
messages = await compactMessages({
  messages,
  maxContextTokens: 200_000,
  summarize: async (older, targetTokens) => {
    return callMyOwnSummarizer(older, targetTokens);
  },
});
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `messages` | `ModelMessage[]` | required | Conversation to compact |
| `maxContextTokens` | `number` | required | Model's context window |
| `summaryModel` *or* `summarize` | `LanguageModelV3` *or* fn | required | Exactly one |
| `autoCompactThresholdPct` | `number` (0-1) | `0.8` | Trigger threshold |
| `summaryTargetTokens` | `number` | `floor(maxContextTokens * 0.05)` | Target summary size |
| `reservedOutputTokens` | `number` | `16384` | Tokens reserved for output |
| `keepRecentMessages` | `number` | `1` | Last N messages kept verbatim (extended for tool-chain safety) |
| `estimateTokens` | `(msgs) => number` | char/4 heuristic | Custom token estimator (use a real tokenizer for accuracy) |
| `onCompactionFailure` | `'passthrough' \| 'throw'` | `'passthrough'` | What to do when summarization fails or returns oversize text |

**Caveats:**
- Default token estimation is char/4 — coarse but provider-agnostic. For accuracy pass `estimateTokens` with a provider-specific tokenizer (e.g. `tiktoken` for OpenAI, `@anthropic-ai/tokenizer` for Anthropic).
- Multimodal content (images, files) is reduced to placeholders during summarization. Original binary data is gone from the persisted compacted history.
- Summary-of-summary degradation accumulates over very long sessions. Recommend periodic session restarts for long-lived agents.
- Mid-conversation `system` messages are NOT hoisted — only the leading contiguous system prefix is preserved as system.

#### Migration from 1.2.x

Before (v1.2.x):
```typescript
import { createContextCompaction } from 'agentool/context-compaction';
import { wrapLanguageModel } from 'ai';

const model = wrapLanguageModel({
  model: anthropic('claude-sonnet-4-20250514'),
  middleware: createContextCompaction({ maxContextTokens: 200_000 }),
});
const { text } = await generateText({ model, messages });
```

After (v1.3.0):
```typescript
import { compactMessages } from 'agentool/context-compaction';

const model = anthropic('claude-sonnet-4-20250514');
messages = await compactMessages({
  messages,
  summaryModel: model,
  maxContextTokens: 200_000,
});
const { text } = await generateText({ model, messages });
```

---

### ask-user

Prompt the user for input during agent execution.

```typescript
import { createAskUser } from 'agentool/ask-user';

const askUser = createAskUser({
  onQuestion: async (question, options) => {
    // Your UI logic to prompt the user
    return 'User response here';
  },
});

const answer = await askUser.execute(
  { question: 'Which database should I use?', options: ['PostgreSQL', 'MySQL', 'SQLite'] },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `question` (string), `options?` (string[])

---

### sleep

Pause execution for rate limiting or polling intervals.

```typescript
import { sleep } from 'agentool/sleep';

const result = await sleep.execute(
  { durationMs: 2000, reason: 'Waiting for deployment' },
  { toolCallId: 'id', messages: [] },
);
// Returns: "Slept for 2001ms. Reason: Waiting for deployment"
```

**Parameters:** `durationMs` (number, max 300000), `reason?` (string)

---

### agent

Spawn and manage parallel subagents from an orchestrator session.

```typescript
import { openai } from '@ai-sdk/openai';
import { bash, grep, read } from 'agentool';
import { createAgent } from 'agentool/agent';

const agentTool = createAgent({
  model: openai('gpt-4o'),
  tools: { bash, grep, read },
  agents: {
    explorer: {
      description: 'Explore one focused area of the codebase',
      systemPrompt: 'You are a focused exploration subagent. Report findings with file references.',
    },
  },
});

const started = await agentTool.execute(
  {
    action: 'start',
    agent: 'explorer',
    prompt: 'Inspect src/auth and summarize the login flow',
    description: 'auth flow',
  },
  { toolCallId: 'id', messages: [] },
);

const finished = await agentTool.execute(
  { action: 'wait', mode: 'all', timeoutMs: 60000 },
  { toolCallId: 'id', messages: [] },
);
```

**Parameters:** `action` (`start`, `wait`, `status`, `result`, `list`, `stop`), plus action-specific fields.

Subagents do not receive the `agent` tool recursively, even if it is present in the configured toolset.

## Configuration

Every tool follows the **factory + default** pattern:

```typescript
// Default instance -- uses process.cwd(), default timeouts
import { bash } from 'agentool/bash';

// Custom instance -- configure cwd, timeouts, and tool-specific options
import { createBash } from 'agentool/bash';
const myBash = createBash({
  cwd: '/my/project',
  timeout: 60000,
  shell: '/bin/zsh',
});
```

### Base configuration

All tools accept `BaseToolConfig`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Working directory for file operations |

Tools that support timeouts extend `TimeoutConfig`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | varies | Timeout in milliseconds |

### Tool-specific configuration

| Tool | Extra Config |
|------|-------------|
| `bash` | `shell?: string` -- shell binary path |
| `read` | `maxLines?: number` -- max lines to return (default: 2000) |
| `memory` | `memoryDir?: string` -- storage directory |
| `task-create` | `tasksFile?: string` -- JSON file path |
| `task-get` | `tasksFile?: string` -- JSON file path |
| `task-update` | `tasksFile?: string` -- JSON file path |
| `task-list` | `tasksFile?: string` -- JSON file path |
| `web-search` | `onSearch?: (query, opts) => Promise<string>` -- search callback |
| `tool-search` | `tools?: Record<string, { description }>` -- tool registry |
| `output-validator` | `schema?: JsonSchema`, `schemaId?: string`, `ajvOptions?: Record<string, unknown>` |
| `lsp` | `servers?: Record<string, LspServerConfig>` -- LSP servers by file extension |
| `http-request` | `defaultHeaders?: Record<string, string>` -- headers merged into every request |
| `web-fetch` | `maxContentLength?: number`, `userAgent?: string` |
| `ask-user` | `onQuestion?: (question, options?) => Promise<string>` |
| `sleep` | `maxDuration?: number` -- cap in ms (default: 300000) |
| `agent` | `model?: LanguageModel`, `tools?: ToolSet`, `agents?: Record<string, ManagedAgentDefinition>`, `maxConcurrent?: number` |

## Error Handling

Every tool's `execute()` catches errors internally and returns a descriptive string -- **it never throws**:

```typescript
const result = await read.execute(
  { file_path: '/nonexistent/file.ts' },
  { toolCallId: 'id', messages: [] },
);
// Returns: "Error [read]: Failed to read file: ENOENT: no such file or directory..."
```

Error strings follow the format: `Error [tool-name]: {description}` with actionable context to help the AI model recover.

## Imports

### Barrel import (all tools)

```typescript
import {
  bash, createBash,
  read, createRead,
  edit, createEdit,
  write, createWrite,
  grep, createGrep,
  glob, createGlob,
  webFetch, createWebFetch,
  webSearch, createWebSearch,
  toolSearch, createToolSearch,
  outputValidator, createOutputValidator,
  httpRequest, createHttpRequest,
  memory, createMemory,
  multiEdit, createMultiEdit,
  diff, createDiff,
  taskCreate, createTaskCreate,
  taskGet, createTaskGet,
  taskUpdate, createTaskUpdate,
  taskList, createTaskList,
  lsp, createLsp,
  compactMessages,  // helper function, not a tool
  askUser, createAskUser,
  sleep, createSleep,
  agent, createAgent,
} from 'agentool';
```

### Subpath imports (tree-shakeable)

```typescript
import { bash } from 'agentool/bash';
import { grep } from 'agentool/grep';
import { glob } from 'agentool/glob';
import { read } from 'agentool/read';
import { edit } from 'agentool/edit';
import { write } from 'agentool/write';
import { webFetch } from 'agentool/web-fetch';
import { httpRequest } from 'agentool/http-request';
import { memory } from 'agentool/memory';
import { multiEdit } from 'agentool/multi-edit';
import { diff } from 'agentool/diff';
import { taskCreate } from 'agentool/task-create';
import { taskGet } from 'agentool/task-get';
import { taskUpdate } from 'agentool/task-update';
import { taskList } from 'agentool/task-list';
import { webSearch } from 'agentool/web-search';
import { toolSearch } from 'agentool/tool-search';
import { outputValidator } from 'agentool/output-validator';
import { lsp } from 'agentool/lsp';
import { compactMessages } from 'agentool/context-compaction'; // helper function
import { askUser } from 'agentool/ask-user';
import { sleep } from 'agentool/sleep';
import { agent } from 'agentool/agent';
```

## Full Example: AI Coding Agent

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { bash, read, edit, write, glob, grep, diff } from 'agentool';

const { text, steps } = await generateText({
  model: openai('gpt-4o'),
  tools: { bash, read, edit, write, glob, grep, diff },
  maxSteps: 20,
  system: `You are a coding assistant. You can read, search, edit, and write files.
    Always read a file before editing it. Use grep to search for patterns.
    Use glob to find files. Use bash for git, build, and test commands.`,
  prompt: 'Find all console.log statements in src/ and replace them with proper logger calls',
});

console.log(`Completed in ${steps.length} steps`);
console.log(text);
```

## Requirements

| Dependency | Version | Required |
|-----------|---------|----------|
| Node.js | >= 18 | Yes |
| `ai` (Vercel AI SDK) | >= 5.0.17 | Peer dependency |
| `zod` | >= 3.23.0 | Peer dependency |
| `ripgrep` (`rg`) | any | For grep/glob tools |

## License

[Apache-2.0](LICENSE)
