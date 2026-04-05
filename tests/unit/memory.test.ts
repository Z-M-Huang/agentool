import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMemory, memory } from '../../src/memory/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('memory tool', () => {
  let dir: string;
  let memTool: ReturnType<typeof createMemory>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mem-test-'));
    memTool = createMemory({ memoryDir: dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(memory).toBeDefined();
      expect(typeof memory.execute).toBe('function');
    });
  });

  describe('write + read roundtrip', () => {
    it('writes content and reads it back', async () => {
      const writeResult = await memTool.execute(
        { action: 'write', key: 'greeting', content: 'Hello, world!' },
        toolOpts,
      );
      expect(writeResult).toContain('Saved memory "greeting"');

      const readResult = await memTool.execute(
        { action: 'read', key: 'greeting' },
        toolOpts,
      );
      expect(readResult).toBe('Hello, world!');
    });
  });

  describe('list keys', () => {
    it('lists all stored keys', async () => {
      await memTool.execute(
        { action: 'write', key: 'alpha', content: 'a' },
        toolOpts,
      );
      await memTool.execute(
        { action: 'write', key: 'beta', content: 'b' },
        toolOpts,
      );

      const result = await memTool.execute({ action: 'list' }, toolOpts);
      expect(result).toContain('alpha');
      expect(result).toContain('beta');
    });
  });

  describe('delete key', () => {
    it('deletes an existing key', async () => {
      await memTool.execute(
        { action: 'write', key: 'temp', content: 'data' },
        toolOpts,
      );
      const deleteResult = await memTool.execute(
        { action: 'delete', key: 'temp' },
        toolOpts,
      );
      expect(deleteResult).toContain('Deleted memory "temp"');

      const readResult = await memTool.execute(
        { action: 'read', key: 'temp' },
        toolOpts,
      );
      expect(readResult).toContain('not found');
    });
  });

  describe('read nonexistent key', () => {
    it('returns an error string', async () => {
      const result = await memTool.execute(
        { action: 'read', key: 'ghost' },
        toolOpts,
      );
      expect(result).toContain('Error [memory]');
      expect(result).toContain('not found');
    });
  });

  describe('path traversal blocked', () => {
    it('rejects keys with ../ traversal', async () => {
      const result = await memTool.execute(
        { action: 'read', key: '../etc/passwd' },
        toolOpts,
      );
      expect(result).toContain('Error [memory]');
      expect(result).toContain('path traversal');
    });

    it('rejects keys with embedded traversal', async () => {
      const result = await memTool.execute(
        { action: 'write', key: 'foo/../bar', content: 'data' },
        toolOpts,
      );
      expect(result).toContain('Error [memory]');
      expect(result).toContain('path traversal');
    });
  });

  describe('empty key rejected', () => {
    it('rejects empty key for read', async () => {
      const result = await memTool.execute(
        { action: 'read', key: '' },
        toolOpts,
      );
      expect(result).toContain('Error [memory]');
      expect(result).toContain('empty');
    });
  });

  describe('list on empty directory', () => {
    it('returns no entries message', async () => {
      const result = await memTool.execute({ action: 'list' }, toolOpts);
      expect(result).toContain('No memory entries found');
    });
  });

  describe('write without content', () => {
    it('returns error when content is missing', async () => {
      const result = await memTool.execute(
        { action: 'write', key: 'nodata' },
        toolOpts,
      );
      expect(result).toContain('Error [memory]');
      expect(result).toContain('Content is required');
    });
  });

  describe('dots-only key rejected', () => {
    it('rejects a key that is all dots', async () => {
      const result = await memTool.execute(
        { action: 'read', key: '...' },
        toolOpts,
      );
      expect(result).toContain('Error [memory]');
      expect(result).toContain('empty after stripping');
    });
  });

  describe('delete nonexistent key', () => {
    it('returns error when deleting a key that does not exist', async () => {
      const result = await memTool.execute(
        { action: 'delete', key: 'ghost' },
        toolOpts,
      );
      expect(result).toContain('Error [memory]');
      expect(result).toContain('not found');
    });
  });

  describe('write with empty string content', () => {
    it('allows writing empty string content', async () => {
      const writeResult = await memTool.execute(
        { action: 'write', key: 'empty-content', content: '' },
        toolOpts,
      );
      expect(writeResult).toContain('Saved memory "empty-content"');

      const readResult = await memTool.execute(
        { action: 'read', key: 'empty-content' },
        toolOpts,
      );
      expect(readResult).toBe('');
    });
  });

  describe('key sanitization strips leading dots', () => {
    it('strips leading dots from key name', async () => {
      const writeResult = await memTool.execute(
        { action: 'write', key: '..mykey', content: 'data' },
        toolOpts,
      );
      expect(writeResult).toContain('Saved memory "mykey"');
    });
  });
});
