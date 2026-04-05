// Tools - factory + default exports
export { createBash, bash } from './bash/index.js';
export type { BashConfig } from './bash/index.js';

export { createGrep, grep } from './grep/index.js';
export type { GrepConfig } from './grep/index.js';

export { createGlob, glob } from './glob/index.js';
export type { GlobConfig } from './glob/index.js';

export { createRead, read } from './read/index.js';
export type { ReadConfig } from './read/index.js';

export { createEdit, edit } from './edit/index.js';
export type { EditConfig } from './edit/index.js';

export { createWrite, write } from './write/index.js';
export type { WriteConfig } from './write/index.js';

export { createWebFetch, webFetch } from './web-fetch/index.js';
export type { WebFetchConfig } from './web-fetch/index.js';

export { createMemory, memory } from './memory/index.js';
export type { MemoryConfig } from './memory/index.js';

export { createMultiEdit, multiEdit } from './multi-edit/index.js';
export type { MultiEditConfig } from './multi-edit/index.js';

export { createDiff, diff } from './diff/index.js';
export type { DiffConfig } from './diff/index.js';

export { createTaskCreate, taskCreate } from './task-create/index.js';
export type { TaskCreateConfig } from './task-create/index.js';

export { createTaskGet, taskGet } from './task-get/index.js';
export type { TaskGetConfig } from './task-get/index.js';

export { createTaskUpdate, taskUpdate } from './task-update/index.js';
export type { TaskUpdateConfig } from './task-update/index.js';

export { createTaskList, taskList } from './task-list/index.js';
export type { TaskListConfig } from './task-list/index.js';

export { createWebSearch, webSearch } from './web-search/index.js';
export type { WebSearchConfig } from './web-search/index.js';

export { createToolSearch, toolSearch } from './tool-search/index.js';
export type { ToolSearchConfig } from './tool-search/index.js';

export { createLsp, lsp } from './lsp/index.js';
export type { LspConfig } from './lsp/index.js';

export { createHttpRequest, httpRequest } from './http-request/index.js';
export type { HttpRequestConfig } from './http-request/index.js';

export {
  createContextCompaction,
  contextCompaction,
} from './context-compaction/index.js';
export type { ContextCompactionConfig } from './context-compaction/index.js';

export { createAskUser, askUser } from './ask-user/index.js';
export type { AskUserConfig } from './ask-user/index.js';

export { createSleep, sleep } from './sleep/index.js';
export type { SleepConfig } from './sleep/index.js';

// Shared types
export type { BaseToolConfig, TimeoutConfig, ToolResult } from './shared/types.js';
