import { tool } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';
import { expandPath } from '../shared/path.js';
import { pathExists, writeTextContent } from '../shared/file.js';

export type WriteConfig = BaseToolConfig;

/**
 * Creates a write tool that writes text content to a file.
 *
 * The tool creates parent directories as needed (mkdir -p behavior).
 * If the file already exists it is overwritten, not appended.
 * Execute never throws; errors are returned as descriptive strings.
 *
 * @param config - Optional configuration with a custom working directory.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 *
 * @example
 * ```typescript
 * import { createWrite } from 'agentool/write';
 *
 * const writeTool = createWrite({ cwd: '/my/project' });
 * const result = await writeTool.execute(
 *   { file_path: 'src/index.ts', content: 'export {}' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export function createWrite(config: BaseToolConfig = {}) {
  const cwd = config.cwd ?? process.cwd();

  return tool({
    description:
      'Write text content to a file, creating parent directories as needed. ' +
      'If the file exists it is overwritten. ' +
      'Use this to create new files or replace existing file contents.',
    inputSchema: z.object({
      file_path: z.string().describe('Path to the file to write'),
      content: z.string().describe('Text content to write to the file'),
    }),
    execute: async ({ file_path, content }) => {
      try {
        const absolutePath = expandPath(file_path, cwd);
        const existed = await pathExists(absolutePath);
        await writeTextContent(absolutePath, content);
        const bytes = Buffer.byteLength(content, 'utf-8');
        const verb = existed ? 'Updated' : 'Created';
        return `${verb} file: ${absolutePath} (${bytes} bytes)`;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return `Error [write]: Failed to write file: ${message}`;
      }
    },
  });
}

/**
 * Default write tool instance using the current working directory.
 *
 * @example
 * ```typescript
 * import { write } from 'agentool/write';
 * const result = await write.execute(
 *   { file_path: '/tmp/hello.txt', content: 'hello' },
 *   { toolCallId: 'id', messages: [] },
 * );
 * ```
 */
export const write = createWrite();
