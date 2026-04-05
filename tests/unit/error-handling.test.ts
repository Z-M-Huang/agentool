import { describe, it, expect } from 'vitest';
import { bash } from '../../src/bash/index.js';
import { grep } from '../../src/grep/index.js';
import { glob } from '../../src/glob/index.js';
import { read } from '../../src/read/index.js';
import { edit } from '../../src/edit/index.js';
import { write } from '../../src/write/index.js';
import { webFetch } from '../../src/web-fetch/index.js';
import { memory } from '../../src/memory/index.js';
import { multiEdit } from '../../src/multi-edit/index.js';
import { diff } from '../../src/diff/index.js';
import { task } from '../../src/task/index.js';
import { lsp } from '../../src/lsp/index.js';
import { httpRequest } from '../../src/http-request/index.js';
import { contextCompaction } from '../../src/context-compaction/index.js';
import { askUser } from '../../src/ask-user/index.js';
import { sleep } from '../../src/sleep/index.js';

const ctx = { toolCallId: 'test', messages: [] as never[] };

describe('error handling: execute never throws', () => {
  it('bash: invalid command returns error string', async () => {
    const result = await bash.execute(
      { command: 'nonexistent_cmd_xyz_123' },
      ctx,
    );
    expect(typeof result).toBe('string');
    // A nonexistent command produces a non-zero exit code or error
    expect(result).toMatch(/exit code|error|not found|command not found/i);
  });

  it('read: nonexistent file returns error string', async () => {
    const result = await read.execute(
      { file_path: '/tmp/__agentool_no_such_file_ever__' },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [read]');
  });

  it('edit: file not found returns error string', async () => {
    const result = await edit.execute(
      {
        file_path: '/tmp/__agentool_no_such_file_ever__',
        old_string: 'foo',
        new_string: 'bar',
      },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [edit]');
  });

  it('write: invalid path returns error string', async () => {
    // /dev/null is a file, not a directory, so writing a child is invalid
    const result = await write.execute(
      { file_path: '/dev/null/impossible/path.txt', content: 'test' },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [write]');
  });

  it('grep: invalid regex returns string (never throws)', async () => {
    const result = await grep.execute(
      { pattern: '[invalid(regex' },
      ctx,
    );
    expect(typeof result).toBe('string');
    // ripgrep exit code 2 (regex error) is caught internally and
    // resolved as an empty result set, so either error or "No matches" is valid
    expect(result.length).toBeGreaterThan(0);
  });

  it('glob: nonexistent directory returns error string', async () => {
    const result = await glob.execute(
      { pattern: '*.ts', path: '/tmp/__agentool_no_such_dir_ever__' },
      ctx,
    );
    expect(typeof result).toBe('string');
    // Either an error or "No files found" -- both are valid non-throwing results
    expect(result.length).toBeGreaterThan(0);
  });

  it('memory: read nonexistent key returns error string', async () => {
    const result = await memory.execute(
      { action: 'read', key: '__nonexistent_key_xyz__' },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [memory]');
    expect(result).toContain('not found');
  });

  it('task: get nonexistent id returns error string', async () => {
    const result = await task.execute(
      { action: 'get', id: 'nonexistent_id_xyz_123' },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [task]');
    expect(result).toContain('not found');
  });

  it('web-fetch: invalid url returns error string', async () => {
    const result = await webFetch.execute(
      { url: 'not-a-valid-url' },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [web-fetch]');
  });

  it('http-request: unreachable host returns error string', async () => {
    const result = await httpRequest.execute(
      { method: 'GET', url: 'http://192.0.2.1:1/', timeout: 500 },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [http-request]');
  }, 10_000);

  it('sleep: negative duration returns string (clamped to 0)', async () => {
    const result = await sleep.execute(
      { durationMs: -100 },
      ctx,
    );
    expect(typeof result).toBe('string');
    // Negative values are clamped to 0 -- still returns a valid string result
    expect(result).toContain('Slept for');
    expect(result).toContain('clamped');
  });

  it('ask-user: no callback configured returns error string', async () => {
    const result = await askUser.execute(
      { question: 'Are you there?' },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [ask-user]');
    expect(result).toContain('onQuestion');
  });

  it('context-compaction: over budget with no summarizer returns error string', async () => {
    const longContent = 'x'.repeat(50_000);
    const result = await contextCompaction.execute(
      {
        messages: [
          { role: 'user', content: longContent },
          { role: 'assistant', content: longContent },
        ],
      },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [context-compaction]');
    expect(result).toContain('summarize');
  });

  it('multi-edit: file not found returns error string', async () => {
    const result = await multiEdit.execute(
      {
        file_path: '/tmp/__agentool_no_such_file_ever__',
        edits: [{ old_string: 'a', new_string: 'b' }],
      },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [multi-edit]');
  });

  it('diff: nonexistent file returns error string', async () => {
    const result = await diff.execute(
      {
        file_path: '/tmp/__agentool_no_such_file_ever__',
        other_file_path: '/tmp/__agentool_no_such_file_ever_2__',
      },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [diff]');
  });

  it('lsp: no servers configured returns error string', async () => {
    const result = await lsp.execute(
      { operation: 'hover', filePath: 'test.ts', line: 0, character: 0 },
      ctx,
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Error [lsp]');
    expect(result).toContain('No LSP servers configured');
  });
});
