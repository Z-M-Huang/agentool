import { tool } from 'ai';
import { z } from 'zod';
import { join } from 'node:path';
import type { BaseToolConfig } from '../shared/types.js';
import { containsPathTraversal } from '../shared/path.js';
import { writeTextContent, readTextContent, listDirectory, removeFile } from '../shared/file.js';
import { extractErrorMessage } from '../shared/errors.js';
import { getPrompt } from './prompt.js';

export { getPrompt as memoryPrompt } from './prompt.js';

/**
 * Configuration for the memory tool.
 * Extends {@link BaseToolConfig} with an optional memory directory path.
 *
 * @example
 * ```typescript
 * import type { MemoryConfig } from 'agentool/memory';
 * const config: MemoryConfig = { memoryDir: '/my/project/.agentool/memory' };
 * ```
 */
export interface MemoryConfig extends BaseToolConfig {
  /** Directory for memory files. Defaults to `<cwd>/.agentool/memory`. */
  memoryDir?: string;
  /** Override the default tool description. */
  description?: string;
}

/**
 * Sanitize a memory key. Returns the cleaned key or an error string.
 */
function sanitizeKey(key: string | undefined): { ok: string } | { err: string } {
  if (!key || key.trim() === '') {
    return { err: 'Error [memory]: Key must not be empty.' };
  }
  if (containsPathTraversal(key)) {
    return { err: 'Error [memory]: Key contains path traversal and was rejected.' };
  }
  const cleaned = key.replace(/^\.+/, '');
  if (cleaned === '') {
    return { err: 'Error [memory]: Key must not be empty after stripping leading dots.' };
  }
  return { ok: cleaned };
}

/**
 * Creates a memory tool that provides file-based key-value storage.
 *
 * Memory entries are stored as individual `.md` files inside the configured
 * memory directory. Keys are sanitized to prevent path traversal.
 * Execute never throws; errors are returned as descriptive strings.
 *
 * @param config - Optional configuration for cwd and memory directory.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createMemory } from 'agentool/memory';
 *
 * const memTool = createMemory({ cwd: '/my/project' });
 * const result = await memTool.execute(
 *   { action: 'write', key: 'notes', content: 'Hello' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createMemory(config: MemoryConfig = {}) {
  const cwd = config.cwd ?? process.cwd();
  const memoryDir = config.memoryDir ?? join(cwd, '.agentool', 'memory');

  return tool({
    description: config.description ?? getPrompt(),
    inputSchema: z.object({
      action: z.enum(['read', 'write', 'list', 'delete']).describe(
        'The operation to perform: read, write, list, or delete',
      ),
      key: z.string().optional().describe(
        'The memory key (required for read, write, delete)',
      ),
      content: z.string().optional().describe(
        'The content to store (required for write)',
      ),
    }),
    execute: async ({ action, key, content }) => {
      try {
        if (action === 'list') {
          return await listKeys(memoryDir);
        }

        const result = sanitizeKey(key);
        if ('err' in result) return result.err;
        const safeKey = result.ok;

        switch (action) {
          case 'write':
            return await writeEntry(memoryDir, safeKey, content);
          case 'read':
            return await readEntry(memoryDir, safeKey);
          case 'delete':
            return await deleteEntry(memoryDir, safeKey);
          default:
            return `Error [memory]: Unknown action "${String(action)}".`;
        }
      } catch (error: unknown) {
        const msg = extractErrorMessage(error);
        return `Error [memory]: ${msg}`;
      }
    },
  });
}

async function writeEntry(dir: string, key: string, content: string | undefined): Promise<string> {
  if (!content && content !== '') {
    return 'Error [memory]: Content is required for write action.';
  }
  await writeTextContent(join(dir, `${key}.md`), content);
  return `Saved memory "${key}".`;
}

async function readEntry(dir: string, key: string): Promise<string> {
  try {
    return await readTextContent(join(dir, `${key}.md`));
  } catch {
    return `Error [memory]: Key "${key}" not found.`;
  }
}

async function listKeys(dir: string): Promise<string> {
  try {
    const files = await listDirectory(dir);
    const keys = files.filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
    if (keys.length === 0) return 'No memory entries found.';
    return keys.join('\n');
  } catch {
    return 'No memory entries found.';
  }
}

async function deleteEntry(dir: string, key: string): Promise<string> {
  try {
    await removeFile(join(dir, `${key}.md`));
    return `Deleted memory "${key}".`;
  } catch {
    return `Error [memory]: Key "${key}" not found.`;
  }
}

/**
 * Default memory tool instance using `.agentool/memory` under the current
 * working directory.
 *
 * @example
 * ```typescript
 * import { memory } from 'agentool/memory';
 * const result = await memory.execute(
 *   { action: 'list' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export const memory = createMemory();
