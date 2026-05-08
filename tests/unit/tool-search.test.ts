import { describe, expect, it } from 'vitest';
import {
  createToolSearch,
  toolSearch,
  toolSearchPrompt,
  type ToolSearchConfig,
} from '../../src/tool-search/index.js';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('tool-search tool', () => {
  describe('default export', () => {
    it('exists and exposes tool metadata', () => {
      expect(toolSearch).toBeDefined();
      expect(typeof toolSearch.execute).toBe('function');
      expect(typeof toolSearch.description).toBe('string');
      expect(toolSearch.description.length).toBeGreaterThan(0);
      expect(toolSearch.inputSchema).toBeDefined();
    });
  });

  describe('ToolSearchConfig interface', () => {
    it('accepts an empty object', () => {
      const cfg: ToolSearchConfig = {};
      expect(cfg).toEqual({});
    });
  });

  describe('toolSearchPrompt', () => {
    it('returns the default tool description', () => {
      expect(toolSearchPrompt()).toContain('Search for available tools');
    });
  });

  describe('search behavior', () => {
    it('returns a clear message when no registry is configured', async () => {
      const result = await createToolSearch().execute(
        { query: 'read', max_results: 5 },
        toolOpts,
      );

      expect(result).toContain('No tools registered');
    });

    it('scores exact, name, description, and word matches in descending order', async () => {
      const tool = createToolSearch({
        tools: {
          read: { description: 'Read files from the workspace' },
          reader: { description: 'Inspect file metadata' },
          grep: { description: 'Search read output with ripgrep' },
          bash: { description: 'Run shell commands' },
        },
      });

      const result = await tool.execute(
        { query: 'read', max_results: 3 },
        toolOpts,
      );

      const lines = result.split('\n');
      expect(lines[0]).toBe('read: Read files from the workspace');
      expect(result).toContain('reader: Inspect file metadata');
      expect(result).toContain('grep: Search read output with ripgrep');
      expect(result).not.toContain('bash: Run shell commands');
    });

    it('honors max_results', async () => {
      const tool = createToolSearch({
        tools: {
          read: { description: 'Read files' },
          grep: { description: 'Read matching file snippets' },
        },
      });

      const result = await tool.execute(
        { query: 'read file', max_results: 1 },
        toolOpts,
      );

      expect(result.split('\n')).toHaveLength(1);
    });

    it('returns a no-match message when nothing scores above zero', async () => {
      const tool = createToolSearch({
        tools: {
          bash: { description: 'Run shell commands' },
        },
      });

      const result = await tool.execute(
        { query: 'database', max_results: 5 },
        toolOpts,
      );

      expect(result).toBe('No tools matched query "database".');
    });

    it('returns an error string when registry access throws', async () => {
      const badTool = Object.defineProperty({}, 'description', {
        get() {
          throw new Error('registry boom');
        },
      }) as { description: string };
      const tool = createToolSearch({ tools: { bad: badTool } });

      const result = await tool.execute(
        { query: 'bad', max_results: 5 },
        toolOpts,
      );

      expect(result).toContain('Error [tool-search]: registry boom');
    });
  });
});
