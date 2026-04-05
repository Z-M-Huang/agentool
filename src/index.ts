// Tools - factory + default exports
export { createBash, bash, bashPrompt } from './bash/index.js';
export type { BashConfig } from './bash/index.js';

export { createGrep, grep, grepPrompt } from './grep/index.js';
export type { GrepConfig } from './grep/index.js';

export { createGlob, glob, globPrompt } from './glob/index.js';
export type { GlobConfig } from './glob/index.js';

export { createRead, read, readPrompt } from './read/index.js';
export type { ReadConfig } from './read/index.js';

export { createEdit, edit, editPrompt } from './edit/index.js';
export type { EditConfig } from './edit/index.js';

export { createWrite, write, writePrompt } from './write/index.js';
export type { WriteConfig } from './write/index.js';

export { createWebFetch, webFetch, webFetchPrompt } from './web-fetch/index.js';
export type { WebFetchConfig } from './web-fetch/index.js';

export { createMemory, memory, memoryPrompt } from './memory/index.js';
export type { MemoryConfig } from './memory/index.js';

export { createMultiEdit, multiEdit, multiEditPrompt } from './multi-edit/index.js';
export type { MultiEditConfig } from './multi-edit/index.js';

export { createDiff, diff, diffPrompt } from './diff/index.js';
export type { DiffConfig } from './diff/index.js';

export { createTaskCreate, taskCreate, taskCreatePrompt } from './task-create/index.js';
export type { TaskCreateConfig } from './task-create/index.js';

export { createTaskGet, taskGet, taskGetPrompt } from './task-get/index.js';
export type { TaskGetConfig } from './task-get/index.js';

export { createTaskUpdate, taskUpdate, taskUpdatePrompt } from './task-update/index.js';
export type { TaskUpdateConfig } from './task-update/index.js';

export { createTaskList, taskList, taskListPrompt } from './task-list/index.js';
export type { TaskListConfig } from './task-list/index.js';

export { createWebSearch, webSearch, webSearchPrompt } from './web-search/index.js';
export type { WebSearchConfig } from './web-search/index.js';

export { createToolSearch, toolSearch, toolSearchPrompt } from './tool-search/index.js';
export type { ToolSearchConfig } from './tool-search/index.js';

export { createLsp, lsp, lspPrompt } from './lsp/index.js';
export type { LspConfig } from './lsp/index.js';

export { createHttpRequest, httpRequest, httpRequestPrompt } from './http-request/index.js';
export type { HttpRequestConfig } from './http-request/index.js';

export {
  createContextCompaction,
  contextCompaction,
  contextCompactionPrompt,
} from './context-compaction/index.js';
export type { ContextCompactionConfig } from './context-compaction/index.js';

export { createAskUser, askUser, askUserPrompt } from './ask-user/index.js';
export type { AskUserConfig } from './ask-user/index.js';

export { createSleep, sleep, sleepPrompt } from './sleep/index.js';
export type { SleepConfig } from './sleep/index.js';

// Shared types
export type { BaseToolConfig, TimeoutConfig, ToolResult } from './shared/types.js';
