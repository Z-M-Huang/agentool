# agentool — Comprehensive Init Plan

## Context

New npm package (`agentool` v1.0.0, https://www.npmjs.com/package/agentool) that provides Claude Code's tools as independent, importable modules for the Vercel AI SDK. Claude Code source (v2.1.88) at `/app/claude-code` is the reference. Tools are **re-implemented cleanly** — Claude Code's tools are deeply coupled to permissions, UI, analytics, and state management that don't apply here.

## All Claude Code Tools — Feasibility Assessment

| Tool | Claude Code Source | Standalone? | Plan |
|------|-------------------|-------------|------|
| Bash | `tools/BashTool/` | Yes | Phase 1 |
| Grep | `tools/GrepTool/` | Yes | Phase 1 |
| Glob | `tools/GlobTool/` | Yes | Phase 1 |
| Read | `tools/FileReadTool/` | Yes | Phase 1 |
| Edit | `tools/FileEditTool/` | Yes | Phase 1 |
| Write | `tools/FileWriteTool/` | Yes | Phase 1 |
| WebFetch | `tools/WebFetchTool/` | Yes | Phase 1 |
| WebSearch | `tools/WebSearchTool/` | No — uses Anthropic server-side `web_search` tool | Skip |
| NotebookEdit | `tools/NotebookEditTool/` | Yes | Skip — niche |
| LSP | `tools/LSPTool/` | Partial — needs LSP server config | Phase 3 |
| TaskCreate/Get/Update/List | `tools/Task*Tool/` | Yes — rewrite as unified tool | Phase 2 |
| TodoWrite | `tools/TodoWriteTool/` | Yes — merge with task tool | Phase 2 |
| AskUserQuestion | `tools/AskUserQuestionTool/` | Yes | Phase 3 |
| Sleep | `tools/SleepTool/` | Yes — trivial | Phase 3 |
| Agent | `tools/AgentTool/` | No — tied to Claude Code sub-agent system | Skip |
| Skill | `tools/SkillTool/` | No — tied to Claude Code skill system | Skip |
| ToolSearch | `tools/ToolSearchTool/` | No — tied to deferred tool loading | Skip |
| MCP/ListMcp/ReadMcp | `tools/MCPTool/` etc. | No — tied to MCP connections | Skip |
| EnterPlanMode/ExitPlanMode | `tools/Enter/ExitPlanModeTool/` | No — tied to Claude Code session state | Skip |
| EnterWorktree/ExitWorktree | `tools/Enter/ExitWorktreeTool/` | No — tied to Claude Code session | Skip |
| Config | `tools/ConfigTool/` | No — tied to Claude Code settings | Skip |
| RemoteTrigger | `tools/RemoteTriggerTool/` | No — tied to Claude Code CCR API | Skip |
| ScheduleCron | `tools/ScheduleCronTool/` | No — tied to Claude Code cron infra | Skip |
| SendMessage | `tools/SendMessageTool/` | No — tied to Claude Code agent messaging | Skip |
| Brief/SendUserMessage | `tools/BriefTool/` | No — tied to Claude Code UI | Skip |
| TeamCreate/TeamDelete | `tools/TeamCreateTool/` | No — tied to Claude Code team system | Skip |
| PowerShell | `tools/PowerShellTool/` | Redundant — bash tool handles cross-platform | Skip |

### New Tools (not in Claude Code, but useful for AI SDK agents)

| Tool | Description | Plan |
|------|-------------|------|
| Memory | File-based key-value memory store | Phase 1 |
| MultiEdit | Apply multiple edits to one file atomically | Phase 2 |
| Diff | Generate unified diffs between files/strings | Phase 2 |
| HttpRequest | Arbitrary HTTP requests (GET/POST/PUT/DELETE with headers/body) | Phase 3 |
| ContextCompaction | Summarize/compact conversation history to reduce tokens | Phase 3 |

---

## Phase 1: Core Tools (this PR)

**Goal:** Ship the 8 essential tools + project scaffolding + README + CLAUDE.md

### Package Structure

```
agentool/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
├── LICENSE                    # existing, Apache-2.0
├── README.md
├── CLAUDE.md
├── src/
│   ├── index.ts               # Re-exports all tool factories
│   ├── shared/
│   │   ├── types.ts           # Common config types
│   │   ├── path.ts            # expandPath, toRelativePath
│   │   ├── ripgrep.ts         # ripgrep execution wrapper
│   │   ├── glob.ts            # glob via ripgrep --files
│   │   ├── file.ts            # readFileInRange, addLineNumbers, writeTextContent
│   │   ├── shell.ts           # Shell command execution
│   │   ├── fetch.ts           # HTTP fetch + HTML-to-markdown
│   │   ├── diff.ts            # Unified diff generation
│   │   └── lsp-client.ts     # LSP client connection management
│   ├── bash/
│   │   └── index.ts
│   ├── grep/
│   │   └── index.ts
│   ├── glob/
│   │   └── index.ts
│   ├── read/
│   │   └── index.ts
│   ├── edit/
│   │   └── index.ts
│   ├── write/
│   │   └── index.ts
│   ├── web-fetch/
│   │   └── index.ts
│   ├── memory/
│   │   └── index.ts
│   ├── multi-edit/
│   │   └── index.ts
│   ├── diff/
│   │   └── index.ts
│   ├── task/
│   │   └── index.ts
│   ├── lsp/
│   │   └── index.ts
│   ├── http-request/
│   │   └── index.ts
│   ├── context-compaction/
│   │   └── index.ts
│   ├── ask-user/
│   │   └── index.ts
│   └── sleep/
│       └── index.ts
```

### Tool Pattern

Every tool exports a **factory** (configurable) and a **default instance** (zero-config):

```typescript
// src/grep/index.ts
import { tool } from 'ai';
import { z } from 'zod';

export type GrepConfig = { cwd?: string; timeout?: number };

export function createGrep(config: GrepConfig = {}) {
  return tool({
    description: 'Search file contents using ripgrep...',
    inputSchema: z.object({ pattern: z.string(), path: z.string().optional(), /* ... */ }),
    execute: async (args) => { /* core logic ported from GrepTool.call() */ },
  });
}

export const grep = createGrep();
```

**Consumer usage:**
```typescript
import { grep } from 'agentool/grep';
import { bash } from 'agentool/bash';
import { generateText } from 'ai';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  tools: { grep, bash },
  prompt: 'Find all TODO comments',
});
```

### Phase 1 Tool Specifications

#### bash (`agentool/bash`)
- **Config:** `{ cwd?, timeout?, shell? }`
- **Input:** `command`, `timeout?`, `description?`
- **Logic:** Spawn shell child process, capture stdout/stderr, handle timeout. Simplified from `utils/Shell.ts`.
- **Returns:** Formatted string with stdout, stderr, exitCode
- **Ref:** `BashTool.call()` (BashTool.tsx), `utils/Shell.ts`

#### grep (`agentool/grep`)
- **Config:** `{ cwd?, timeout? }`
- **Input:** `pattern`, `path?`, `glob?`, `output_mode?` (content/files_with_matches/count), `-B?`, `-A?`, `-C?`, `context?`, `-n?`, `-i?`, `type?`, `head_limit?`, `offset?`, `multiline?`
- **Logic:** Build ripgrep args, execute, parse results, apply head_limit, relativize paths
- **Ref:** `GrepTool.call()` lines 310-576, `utils/ripgrep.ts`

#### glob (`agentool/glob`)
- **Config:** `{ cwd?, timeout?, maxResults? }`
- **Input:** `pattern`, `path?`
- **Logic:** ripgrep `--files --glob <pattern> --sort=modified`
- **Ref:** `GlobTool.call()`, `utils/glob.ts`

#### read (`agentool/read`)
- **Config:** `{ cwd?, maxLines?, maxSizeBytes? }`
- **Input:** `file_path`, `offset?`, `limit?`
- **Logic:** Read file range, add `cat -n` style line numbers, detect binary, handle ENOENT
- **Ref:** `FileReadTool.call()`, `utils/readFileInRange.ts`

#### edit (`agentool/edit`)
- **Config:** `{ cwd? }`
- **Input:** `file_path`, `old_string`, `new_string`, `replace_all?`
- **Logic:** Read file, find old_string (uniqueness check), replace, write back
- **Key validation:** old_string must exist, must be unique (unless replace_all), must differ from new_string
- **Ref:** `FileEditTool.call()`, `FileEditTool/utils.ts`

#### write (`agentool/write`)
- **Config:** `{ cwd? }`
- **Input:** `file_path`, `content`
- **Logic:** mkdir -p parent, write file, report create vs update
- **Ref:** `FileWriteTool.call()`

#### web-fetch (`agentool/web-fetch`)
- **Config:** `{ maxContentLength?, timeout?, userAgent? }`
- **Input:** `url`, `prompt?`
- **Logic:** Fetch URL with native `fetch()`, convert HTML to markdown with turndown, truncate
- **Note:** Returns raw markdown. Unlike Claude Code's version (calls Haiku to process), the calling AI model handles interpretation.
- **Ref:** `WebFetchTool/utils.ts`

#### memory (`agentool/memory`)
- **Config:** `{ memoryDir? }`
- **Input:** `action` (read|write|list|delete), `key?`, `content?`
- **Logic:** File-based key-value store at `.agentool/memory/` relative to cwd
- **Note:** New tool, simplified version of Claude Code's `~/.claude/projects/*/memory/` system

### Shared Utilities (Phase 1)

| File | Ported From | Purpose |
|------|------------|---------|
| `shared/types.ts` | New | `BaseToolConfig` type |
| `shared/path.ts` | `utils/path.ts` | `expandPath()`, `toRelativePath()` |
| `shared/ripgrep.ts` | `utils/ripgrep.ts` | Find rg binary, execute, parse. Strip: bundled mode, analytics, codesign |
| `shared/glob.ts` | `utils/glob.ts` | ripgrep `--files` mode. Strip: permissions, plugin cache |
| `shared/file.ts` | `utils/file.ts` + `utils/readFileInRange.ts` | `readFileInRange()`, `addLineNumbers()`, `writeTextContent()` |
| `shared/shell.ts` | `utils/Shell.ts` | Simplified spawn. Strip: sandbox, env snapshot, shell provider |
| `shared/fetch.ts` | `WebFetchTool/utils.ts` | Native fetch + turndown. Strip: blocklist, LRU, Haiku |

### package.json

```json
{
  "name": "agentool",
  "version": "1.0.0",
  "description": "Claude Code tools as standalone Vercel AI SDK tools",
  "type": "module",
  "license": "Apache-2.0",
  "exports": {
    ".":           { "types": "./dist/index.d.ts",          "import": "./dist/index.mjs",          "require": "./dist/index.js" },
    "./bash":      { "types": "./dist/bash/index.d.ts",     "import": "./dist/bash/index.mjs",     "require": "./dist/bash/index.js" },
    "./grep":      { "types": "./dist/grep/index.d.ts",     "import": "./dist/grep/index.mjs",     "require": "./dist/grep/index.js" },
    "./glob":      { "types": "./dist/glob/index.d.ts",     "import": "./dist/glob/index.mjs",     "require": "./dist/glob/index.js" },
    "./read":      { "types": "./dist/read/index.d.ts",     "import": "./dist/read/index.mjs",     "require": "./dist/read/index.js" },
    "./edit":      { "types": "./dist/edit/index.d.ts",     "import": "./dist/edit/index.mjs",     "require": "./dist/edit/index.js" },
    "./write":     { "types": "./dist/write/index.d.ts",    "import": "./dist/write/index.mjs",    "require": "./dist/write/index.js" },
    "./web-fetch": { "types": "./dist/web-fetch/index.d.ts","import": "./dist/web-fetch/index.mjs","require": "./dist/web-fetch/index.js" },
    "./memory":    { "types": "./dist/memory/index.d.ts",   "import": "./dist/memory/index.mjs",   "require": "./dist/memory/index.js" },
    "./multi-edit":{ "types": "./dist/multi-edit/index.d.ts","import": "./dist/multi-edit/index.mjs","require": "./dist/multi-edit/index.js" },
    "./diff":      { "types": "./dist/diff/index.d.ts",    "import": "./dist/diff/index.mjs",    "require": "./dist/diff/index.js" },
    "./task":      { "types": "./dist/task/index.d.ts",     "import": "./dist/task/index.mjs",     "require": "./dist/task/index.js" },
    "./lsp":       { "types": "./dist/lsp/index.d.ts",      "import": "./dist/lsp/index.mjs",      "require": "./dist/lsp/index.js" },
    "./http-request":{ "types": "./dist/http-request/index.d.ts","import": "./dist/http-request/index.mjs","require": "./dist/http-request/index.js" },
    "./context-compaction":{ "types": "./dist/context-compaction/index.d.ts","import": "./dist/context-compaction/index.mjs","require": "./dist/context-compaction/index.js" },
    "./ask-user":  { "types": "./dist/ask-user/index.d.ts", "import": "./dist/ask-user/index.mjs", "require": "./dist/ask-user/index.js" },
    "./sleep":     { "types": "./dist/sleep/index.d.ts",    "import": "./dist/sleep/index.mjs",    "require": "./dist/sleep/index.js" }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "peerDependencies": {
    "ai": ">=4.0.0",
    "zod": ">=3.23.0"
  },
  "dependencies": {
    "turndown": "^7.2.0",
    "diff": "^7.0.0"
  },
  "devDependencies": {
    "ai": "^6.0.0",
    "zod": "^3.25.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0",
    "@types/turndown": "^5.0.0",
    "@types/diff": "^7.0.0"
  },
  "engines": { "node": ">=18.0.0" }
}
```

### Build Setup

**tsup.config.ts** — entry per subpath, dual ESM/CJS, splitting for shared chunks:
```typescript
export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'bash/index': 'src/bash/index.ts',
    'grep/index': 'src/grep/index.ts',
    'glob/index': 'src/glob/index.ts',
    'read/index': 'src/read/index.ts',
    'edit/index': 'src/edit/index.ts',
    'write/index': 'src/write/index.ts',
    'web-fetch/index': 'src/web-fetch/index.ts',
    'memory/index': 'src/memory/index.ts',
    'multi-edit/index': 'src/multi-edit/index.ts',
    'diff/index': 'src/diff/index.ts',
    'task/index': 'src/task/index.ts',
    'lsp/index': 'src/lsp/index.ts',
    'http-request/index': 'src/http-request/index.ts',
    'context-compaction/index': 'src/context-compaction/index.ts',
    'ask-user/index': 'src/ask-user/index.ts',
    'sleep/index': 'src/sleep/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  external: ['ai', 'zod'],
  target: 'node18',
});
```

### Implementation Order

1. **Scaffolding:** package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, .gitignore
2. **Install deps:** `npm install`
3. **Shared utilities:** types.ts, path.ts, ripgrep.ts, file.ts, glob.ts, shell.ts, fetch.ts, diff.ts, lsp-client.ts
4. **Phase 1 — Core tools:** read, grep, glob, edit, write, bash, web-fetch, memory
5. **Phase 2 — Extended tools:** multi-edit, diff, task
6. **Phase 3 — Intelligence & network tools:** lsp, http-request, context-compaction, ask-user, sleep
7. **Entry point:** src/index.ts (re-exports all 16 tools)
8. **Docs:** README.md, CLAUDE.md
9. **Build & verify:** `npm run build`, `npm run typecheck`

---

## Phase 2: Extended File & Task Tools

### multi-edit (`agentool/multi-edit`)
- **Input:** `file_path`, `edits: Array<{ old_string, new_string }>`
- **Logic:** Apply multiple string replacements to a single file atomically (all-or-nothing). Prevents partial edits that leave files in broken state.
- **Note:** New tool. Claude Code doesn't have this — it relies on sequential edit calls.

### diff (`agentool/diff`)
- **Input:** `file_path`, `other_file_path?`, `old_content?`, `new_content?`
- **Logic:** Generate unified diff between two files or two strings. Useful for the model to understand changes before applying them.
- **Note:** New tool. Uses Node's built-in or a minimal diff library.

### task (`agentool/task`)
- **Input:** `action` (create|get|update|list|delete), `id?`, `subject?`, `description?`, `status?` (pending|in_progress|completed)
- **Logic:** JSON-file-based task tracker at `.agentool/tasks.json`. Simplified version of Claude Code's TaskCreate/Get/Update/List tools.
- **Ref:** `TaskCreateTool/`, `TaskGetTool/`, `TaskUpdateTool/`, `TaskListTool/`

### Package changes for Phase 2
Add to exports map:
```json
"./notebook-edit": { ... },
"./multi-edit": { ... },
"./diff": { ... },
"./task": { ... }
```

---

## Phase 3: Intelligence & Network Tools

### lsp (`agentool/lsp`)
- **Input:** `operation` (goToDefinition|findReferences|hover|documentSymbol|workspaceSymbol|goToImplementation|incomingCalls|outgoingCalls), `filePath`, `line`, `character`
- **Logic:** Connect to LSP server, send request, return results. User configures LSP servers via config.
- **Config:** `{ servers: Record<string, { command, args }> }` — map file extensions to LSP server commands
- **Ref:** `LSPTool/`, `services/lsp/`

### http-request (`agentool/http-request`)
- **Input:** `method` (GET|POST|PUT|PATCH|DELETE|HEAD), `url`, `headers?`, `body?`, `timeout?`
- **Logic:** General-purpose HTTP client using native `fetch()`. Unlike web-fetch (which returns markdown for AI consumption), this returns raw response data for API interactions.
- **Note:** New tool. Useful for agents that need to interact with REST APIs.

### context-compaction (`agentool/context-compaction`)
- **Input:** `messages: Message[]`, `maxTokens?`, `preserveSystemMessages?`
- **Logic:** Summarize conversation history to reduce token count while preserving key information. Uses a configurable summarization strategy.
- **Config:** `{ model?, maxOutputTokens? }` — requires user to provide a model for summarization
- **Note:** New tool/utility. Inspired by Claude Code's auto-compaction feature. This is more of a utility function than an AI SDK tool, but exported as both.

### ask-user (`agentool/ask-user`)
- **Input:** `question`, `options?: Array<{ value, label, description? }>`, `allowFreeText?`
- **Logic:** Pauses agent execution and prompts the user for input. For AI SDK, this works with the `experimental_toToolResultContent` pattern or custom middleware.
- **Ref:** `AskUserQuestionTool/`
- **Note:** Implementation depends on the runtime environment (CLI, web, etc.). We provide the tool definition and a callback-based execute pattern.

### sleep (`agentool/sleep`)
- **Input:** `durationMs`, `reason?`
- **Logic:** `await new Promise(resolve => setTimeout(resolve, durationMs))`. Simple but useful for agents that need to wait (polling, rate limiting).
- **Ref:** `SleepTool/`

### Package changes for Phase 3
Add to exports map:
```json
"./lsp": { ... },
"./http-request": { ... },
"./context-compaction": { ... },
"./ask-user": { ... },
"./sleep": { ... }
```

---

## Complete Tool Roadmap

| Phase | Tool | Import | Type |
|-------|------|--------|------|
| 1 | bash | `agentool/bash` | Ported |
| 1 | grep | `agentool/grep` | Ported |
| 1 | glob | `agentool/glob` | Ported |
| 1 | read | `agentool/read` | Ported |
| 1 | edit | `agentool/edit` | Ported |
| 1 | write | `agentool/write` | Ported |
| 1 | web-fetch | `agentool/web-fetch` | Ported |
| 1 | memory | `agentool/memory` | New |
| 2 | multi-edit | `agentool/multi-edit` | New |
| 2 | diff | `agentool/diff` | New |
| 2 | task | `agentool/task` | Ported+New |
| 3 | lsp | `agentool/lsp` | Ported |
| 3 | http-request | `agentool/http-request` | New |
| 3 | context-compaction | `agentool/context-compaction` | New |
| 3 | ask-user | `agentool/ask-user` | Ported |
| 3 | sleep | `agentool/sleep` | New |

All 16 tools will be implemented in this session.

---

## Key Design Decisions

1. **Re-implement, not extract.** Claude Code tools interweave core logic with `ToolUseContext`, `AppState`, permissions, analytics, growthbook, skill loading, file history, diagnostic tracking, LSP integration, and React UI. Extracting directly would pull in the entire dependency graph.

2. **Provider-agnostic (OpenAI, Anthropic, Google).** The Vercel AI SDK's `tool()` function is provider-agnostic by design — the same tool definition works with `openai('gpt-4o')`, `anthropic('claude-sonnet-4-5')`, and `google('gemini-2.5-pro')`. Our tools use standard `inputSchema` (zod) + `execute` — no provider-specific features. Tool descriptions must be clear enough for any model to use effectively. We will test with at least OpenAI, Anthropic, and Google providers.

3. **Return strings from execute().** AI SDK passes tool results back to the model as text. We format results as text directly, matching what Claude Code sends via `mapToolResultToToolResultBlockParam()`. String results work identically across all providers.

4. **`ai` and `zod` as peer deps.** Only hard dep is `turndown` (lazy-loaded by web-fetch only).

5. **`rg` binary not bundled.** Grep and glob detect `rg` from PATH, throw helpful error if missing.

6. **No file state tracking in v1.0.0.** Claude Code tracks read-before-write. We skip this — the calling agent manages tool orchestration.

7. **Factory + default pattern.** `createGrep(config)` for customization, `grep` for zero-config. Enables both simple and advanced usage.

8. **Simple zod schemas.** Keep input schemas straightforward (no complex unions, no deeply nested objects) to maximize compatibility across all model providers. Some models handle complex tool schemas less gracefully than others.

## Risk

1. **Ripgrep not installed:** Grep/glob fail without `rg`. **Mitigation:** Clear error with install instructions in README. Consider adding a `@anthropic-ai/ripgrep` optional dep in Phase 2.
2. **AI SDK version drift:** `tool()` API changed v4→v5 (`parameters`→`inputSchema`). **Mitigation:** Use `inputSchema` (current standard), peer dep `>=4.0.0`, test against v6.
3. **Turndown size:** Only dependency, ~1.4MB. **Mitigation:** Lazy-load only when web-fetch is used. Tree-shaking prevents it from bloating other tools.
4. **Shell injection in bash tool:** User passes arbitrary commands. **Mitigation:** Document that bash tool is inherently dangerous. The calling agent/application must implement its own permission layer. No sandboxing in v1.0.0 (same as other AI SDK shell tools like `bash-tool` npm package).

## Verification (Phase 1)

1. `npm run build` — all entry points compile
2. `npm run typecheck` — type safety passes
3. Subpath exports resolve: `node -e "import('agentool/grep').then(m => console.log(Object.keys(m)))"`
4. README renders correctly on npm

## Critical Reference Files

- `/app/claude-code/src/Tool.ts` — Tool type definition, `buildTool()` function
- `/app/claude-code/src/tools.ts` — Tool registry and imports
- `/app/claude-code/src/tools/GrepTool/GrepTool.ts` — Most complex search tool (lines 310-576)
- `/app/claude-code/src/tools/BashTool/BashTool.tsx` — Shell execution with timeout handling
- `/app/claude-code/src/tools/FileEditTool/FileEditTool.ts` — String replacement with validation
- `/app/claude-code/src/tools/FileEditTool/utils.ts` — findActualString, preserveQuoteStyle
- `/app/claude-code/src/tools/FileReadTool/FileReadTool.ts` — File reading with range support
- `/app/claude-code/src/tools/GlobTool/GlobTool.ts` — Glob matching via ripgrep
- `/app/claude-code/src/tools/WebFetchTool/WebFetchTool.ts` — URL fetching
- `/app/claude-code/src/tools/WebFetchTool/utils.ts` — HTML-to-markdown conversion
- `/app/claude-code/src/utils/ripgrep.ts` — Ripgrep binary detection and execution
- `/app/claude-code/src/utils/glob.ts` — Glob implementation using ripgrep
- `/app/claude-code/src/utils/Shell.ts` — Shell execution and process management
- `/app/claude-code/src/utils/file.ts` — File I/O helpers
- `/app/claude-code/src/utils/readFileInRange.ts` — Range-based file reading
- `/app/claude-code/src/utils/path.ts` — Path expansion and normalization
