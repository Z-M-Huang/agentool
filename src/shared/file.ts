import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Threshold in bytes: files below this use the fast (in-memory) path. */
const FAST_PATH_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Result returned by {@link readFileInRange}.
 */
export interface ReadFileRangeResult {
  /** The selected lines joined with `\n`. */
  content: string;
  /** Number of lines in the returned content. */
  lineCount: number;
  /** Total number of lines in the file. */
  totalLines: number;
}

/**
 * Add `cat -n` style line numbers in compact format.
 *
 * Each line is prefixed with `lineNumber\tline`. Lines are split on
 * `\r?\n` and rejoined with `\n`.
 *
 * @param content   - The text to number.
 * @param startLine - 1-indexed line number for the first line.
 * @returns The numbered text, or an empty string if `content` is empty.
 *
 * @example
 * ```typescript
 * addLineNumbers({ content: 'a\nb', startLine: 1 });
 * // '1\ta\n2\tb'
 * ```
 */
export function addLineNumbers({
  content,
  startLine,
}: {
  content: string;
  startLine: number;
}): string {
  if (!content) {
    return '';
  }

  const lines = content.split(/\r?\n/);
  return lines
    .map((line, index) => `${index + startLine}\t${line}`)
    .join('\n');
}

/**
 * Write UTF-8 text to a file, creating parent directories as needed.
 *
 * @param filePath - Absolute path to the file.
 * @param content  - Text content to write.
 *
 * @example
 * ```typescript
 * await writeTextContent('/tmp/a/b/file.txt', 'hello');
 * ```
 */
export async function writeTextContent(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, { encoding: 'utf-8' });
}

/**
 * Check whether a path exists on disk.
 *
 * @param path - The path to check.
 * @returns `true` if the path exists, `false` otherwise.
 *
 * @example
 * ```typescript
 * await pathExists('/tmp');       // true
 * await pathExists('/no/such');   // false
 * ```
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a range of lines from a file.
 *
 * Uses a fast in-memory path for files under 10 MB and a streaming path
 * for larger files. Both paths strip UTF-8 BOM and convert CRLF to LF.
 *
 * @param filePath - Absolute path to the file.
 * @param offset   - 0-indexed first line to include. Defaults to 0.
 * @param maxLines - Maximum number of lines to return. Omit for all.
 * @returns The selected content, its line count, and total file line count.
 * @throws When the file does not exist (ENOENT) or is a directory (EISDIR).
 *
 * @example
 * ```typescript
 * const r = await readFileInRange('/tmp/data.txt', 0, 10);
 * console.log(r.content, r.lineCount, r.totalLines);
 * ```
 */
export async function readFileInRange(
  filePath: string,
  offset = 0,
  maxLines?: number,
): Promise<ReadFileRangeResult> {
  const stats = await stat(filePath);

  if (stats.isDirectory()) {
    throw new Error(
      `EISDIR: illegal operation on a directory, read '${filePath}'`,
    );
  }

  if (stats.isFile() && stats.size < FAST_PATH_MAX_SIZE) {
    const raw = await readFile(filePath, { encoding: 'utf-8' });
    return readFileInRangeFast(raw, offset, maxLines);
  }

  return readFileInRangeStreaming(filePath, offset, maxLines);
}

// ---------------------------------------------------------------------------
// Fast path -- readFile + in-memory split
// ---------------------------------------------------------------------------

function readFileInRangeFast(
  raw: string,
  offset: number,
  maxLines: number | undefined,
): ReadFileRangeResult {
  // Strip BOM
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  // Strip \r (CRLF -> LF) then split
  const allLines = text.replace(/\r/g, '').split('\n');
  const totalLines = allLines.length;

  const endLine = maxLines !== undefined ? offset + maxLines : totalLines;
  const selected = allLines.slice(offset, endLine);

  return {
    content: selected.join('\n'),
    lineCount: selected.length,
    totalLines,
  };
}

// ---------------------------------------------------------------------------
// Streaming path -- createReadStream with manual line scanning
// ---------------------------------------------------------------------------

function readFileInRangeStreaming(
  filePath: string,
  offset: number,
  maxLines: number | undefined,
): Promise<ReadFileRangeResult> {
  return new Promise((resolve, reject) => {
    const endLine = maxLines !== undefined ? offset + maxLines : Infinity;
    const selectedLines: string[] = [];
    let currentLineIndex = 0;
    let partial = '';
    let isFirstChunk = true;

    const stream = createReadStream(filePath, {
      encoding: 'utf8',
      highWaterMark: 512 * 1024,
    });

    stream.on('data', (raw: string | Buffer) => {
      // encoding: 'utf8' guarantees string chunks at runtime
      let chunk = String(raw);
      if (isFirstChunk) {
        isFirstChunk = false;
        if (chunk.charCodeAt(0) === 0xfeff) {
          chunk = chunk.slice(1);
        }
      }

      const data = partial.length > 0 ? partial + chunk : chunk;
      partial = '';

      let startPos = 0;
      let newlinePos: number;
      while ((newlinePos = data.indexOf('\n', startPos)) !== -1) {
        if (currentLineIndex >= offset && currentLineIndex < endLine) {
          let line = data.slice(startPos, newlinePos);
          if (line.endsWith('\r')) {
            line = line.slice(0, -1);
          }
          selectedLines.push(line);
        }
        currentLineIndex++;
        startPos = newlinePos + 1;
      }

      if (startPos < data.length) {
        if (currentLineIndex >= offset && currentLineIndex < endLine) {
          partial = data.slice(startPos);
        }
      }
    });

    stream.once('end', () => {
      // Handle final partial line
      if (
        partial.length > 0 &&
        currentLineIndex >= offset &&
        currentLineIndex < endLine
      ) {
        let line = partial;
        if (line.endsWith('\r')) {
          line = line.slice(0, -1);
        }
        selectedLines.push(line);
      }
      currentLineIndex++;

      resolve({
        content: selectedLines.join('\n'),
        lineCount: selectedLines.length,
        totalLines: currentLineIndex,
      });
    });

    stream.once('error', reject);
  });
}
