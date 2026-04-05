import { tool } from 'ai';
import { z } from 'zod';
import type { BaseToolConfig } from '../shared/types.js';
import { expandPath, toRelativePath } from '../shared/path.js';
import { getFileStats } from '../shared/file.js';
import { extractErrorMessage } from '../shared/errors.js';
import { executeRipgrep } from '../shared/ripgrep.js';
import { getPrompt } from './prompt.js';

export { getPrompt as grepPrompt } from './prompt.js';

const VCS_DIRS = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'] as const;
const DEFAULT_HEAD_LIMIT = 250;

/** Apply pagination (offset + limit). Reports appliedLimit only when truncation occurred. */
function applyHeadLimit<T>(
  items: T[],
  limit: number | undefined,
  offset: number = 0,
): { items: T[]; appliedLimit: number | undefined } {
  if (limit === 0) return { items: items.slice(offset), appliedLimit: undefined };
  const cap = limit ?? DEFAULT_HEAD_LIMIT;
  const sliced = items.slice(offset, offset + cap);
  const truncated = items.length - offset > cap;
  return { items: sliced, appliedLimit: truncated ? cap : undefined };
}

/** Build a truncation suffix string, empty when no truncation. */
function truncationSuffix(
  appliedLimit: number | undefined,
  offset: number,
): string {
  const parts: string[] = [];
  if (appliedLimit !== undefined) parts.push(`limit: ${appliedLimit}`);
  if (offset > 0) parts.push(`offset: ${offset}`);
  return parts.length > 0 ? `\n\n[Results truncated. ${parts.join(', ')}]` : '';
}

/** Relativize the file-path prefix before the first colon. */
function relativizeLine(line: string, baseCwd: string, last = false): string {
  const idx = last ? line.lastIndexOf(':') : line.indexOf(':');
  if (idx > 0) {
    return toRelativePath(line.substring(0, idx), baseCwd) + line.substring(idx);
  }
  return line;
}

/** Parse glob filter string into individual patterns. */
function parseGlobPatterns(globFilter: string): string[] {
  const patterns: string[] = [];
  for (const raw of globFilter.split(/\s+/)) {
    if (raw.includes('{') && raw.includes('}')) {
      patterns.push(raw);
    } else {
      patterns.push(...raw.split(',').filter(Boolean));
    }
  }
  return patterns;
}

/**
 * Creates a grep tool that searches file contents using ripgrep.
 *
 * Supports three output modes: content, files_with_matches, and count.
 * Execute never throws; errors are returned as descriptive strings.
 *
 * @param config - Optional configuration with a custom working directory.
 * @returns A Vercel AI SDK tool with `description`, `parameters`, and `execute`.
 */
export function createGrep(config: GrepConfig = {}) {
  const cwd = config.cwd ?? process.cwd();

  return tool({
    description: config.description ?? getPrompt(),
    inputSchema: z.object({
      pattern: z.string().describe('The regular expression pattern to search for in file contents'),
      path: z.string().optional().describe('File or directory to search in (rg PATH). Defaults to current working directory.'),
      glob: z.string().optional().describe('Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob'),
      output_mode: z.enum(['content', 'files_with_matches', 'count']).optional()
        .describe('Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".'),
      '-B': z.number().optional().describe('Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.'),
      '-A': z.number().optional().describe('Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.'),
      '-C': z.number().optional().describe('Alias for context.'),
      context: z.number().optional().describe('Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.'),
      '-n': z.boolean().optional().describe('Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise. Defaults to true.'),
      '-i': z.boolean().optional().describe('Case insensitive search (rg -i)'),
      type: z.string().optional().describe('File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types.'),
      head_limit: z.number().optional().describe('Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults to 250 when unspecified. Pass 0 for unlimited (use sparingly \u2014 large result sets waste context).'),
      offset: z.number().optional().describe('Skip first N lines/entries before applying head_limit, equivalent to "| tail -n +N | head -N". Works across all output modes. Defaults to 0.'),
      multiline: z.boolean().optional().describe('Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.'),
    }),
    execute: async (input) => {
      try {
        const {
          pattern, path, glob: globFilter, type: typeFilter,
          output_mode: outputMode = 'files_with_matches',
          '-B': ctxBefore, '-A': ctxAfter, '-C': ctxC,
          context: ctxAlias, '-n': showLineNumbers = true,
          '-i': caseInsensitive = false,
          head_limit: headLimit, offset = 0, multiline = false,
        } = input;

        const absolutePath = path ? expandPath(path, cwd) : cwd;
        const args: string[] = ['--hidden'];

        for (const dir of VCS_DIRS) args.push('--glob', `!${dir}`);
        args.push('--max-columns', '500');

        if (multiline) args.push('-U', '--multiline-dotall');
        if (caseInsensitive) args.push('-i');

        if (outputMode === 'files_with_matches') args.push('-l');
        else if (outputMode === 'count') args.push('-c');

        if (showLineNumbers && outputMode === 'content') args.push('-n');

        if (outputMode === 'content') {
          if (ctxAlias !== undefined) args.push('-C', ctxAlias.toString());
          else if (ctxC !== undefined) args.push('-C', ctxC.toString());
          else {
            if (ctxBefore !== undefined) args.push('-B', ctxBefore.toString());
            if (ctxAfter !== undefined) args.push('-A', ctxAfter.toString());
          }
        }

        if (pattern.startsWith('-')) args.push('-e', pattern);
        else args.push(pattern);

        if (typeFilter) args.push('--type', typeFilter);

        if (globFilter) {
          for (const gp of parseGlobPatterns(globFilter)) args.push('--glob', gp);
        }

        const results = await executeRipgrep(args, absolutePath);
        if (results.length === 0) return 'No matches found';

        // --- content mode ---
        if (outputMode === 'content') {
          const { items, appliedLimit } = applyHeadLimit(results, headLimit, offset);
          const lines = items.map((l) => relativizeLine(l, cwd));
          return lines.join('\n') + truncationSuffix(appliedLimit, offset);
        }

        // --- count mode ---
        if (outputMode === 'count') {
          const { items, appliedLimit } = applyHeadLimit(results, headLimit, offset);
          const lines = items.map((l) => relativizeLine(l, cwd, true));
          let totalMatches = 0;
          let fileCount = 0;
          for (const line of lines) {
            const idx = line.lastIndexOf(':');
            if (idx > 0) {
              const n = parseInt(line.substring(idx + 1), 10);
              if (!isNaN(n)) { totalMatches += n; fileCount += 1; }
            }
          }
          return (
            lines.join('\n') +
            `\n\nTotal: ${totalMatches} matches in ${fileCount} files` +
            truncationSuffix(appliedLimit, offset)
          );
        }

        // --- files_with_matches mode (default) ---
        const stats = await Promise.allSettled(results.map((f) => getFileStats(f)));
        const sorted = results
          .map((fp, i) => {
            const r = stats[i]!;
            const mt = r.status === 'fulfilled' ? (r.value.mtimeMs ?? 0) : 0;
            return [fp, mt] as const;
          })
          .sort((a, b) => {
            const d = b[1] - a[1];
            return d !== 0 ? d : a[0].localeCompare(b[0]);
          })
          .map((e) => e[0]);

        const { items, appliedLimit } = applyHeadLimit(sorted, headLimit, offset);
        const relative = items.map((f) => toRelativePath(f, cwd));
        return relative.join('\n') + truncationSuffix(appliedLimit, offset);
      } catch (error: unknown) {
        const msg = extractErrorMessage(error);
        return `Error [grep]: Failed to search: ${msg}`;
      }
    },
  });
}

/**
 * Default grep tool instance using the current working directory.
 */
export type GrepConfig = BaseToolConfig & {
  /** Override the default tool description. */
  description?: string;
};

export const grep = createGrep();
