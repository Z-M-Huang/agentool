import { describe, expect, it, vi } from 'vitest';
import {
  createWebSearch,
  webSearch,
  webSearchPrompt,
  type WebSearchConfig,
} from '../../src/web-search/index.js';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('web-search tool', () => {
  describe('default export', () => {
    it('exists and exposes tool metadata', () => {
      expect(webSearch).toBeDefined();
      expect(typeof webSearch.execute).toBe('function');
      expect(typeof webSearch.description).toBe('string');
      expect(webSearch.description.length).toBeGreaterThan(0);
      expect(webSearch.inputSchema).toBeDefined();
    });
  });

  describe('WebSearchConfig interface', () => {
    it('accepts an empty object', () => {
      const cfg: WebSearchConfig = {};
      expect(cfg).toEqual({});
    });
  });

  describe('webSearchPrompt', () => {
    it('returns the default tool description', () => {
      expect(webSearchPrompt()).toContain('Search the web');
    });
  });

  describe('search behavior', () => {
    it('returns an error string when no callback is configured', async () => {
      const result = await createWebSearch().execute(
        { query: 'agentool' },
        toolOpts,
      );

      expect(result).toContain('Error [web-search]');
      expect(result).toContain('No search callback configured');
    });

    it('delegates query and domain filters to the configured callback', async () => {
      const onSearch = vi.fn(async () => 'result text');
      const tool = createWebSearch({ onSearch });

      const result = await tool.execute(
        {
          query: 'vitest coverage',
          allowed_domains: ['vitest.dev'],
          blocked_domains: ['example.com'],
        },
        toolOpts,
      );

      expect(result).toBe('result text');
      expect(onSearch).toHaveBeenCalledWith('vitest coverage', {
        allowed_domains: ['vitest.dev'],
        blocked_domains: ['example.com'],
      });
    });

    it('passes undefined filters through when they are omitted', async () => {
      const onSearch = vi.fn(async () => 'ok');
      const tool = createWebSearch({ onSearch });

      await tool.execute({ query: 'agentool' }, toolOpts);

      expect(onSearch).toHaveBeenCalledWith('agentool', {
        allowed_domains: undefined,
        blocked_domains: undefined,
      });
    });

    it('returns an error string when the callback throws', async () => {
      const tool = createWebSearch({
        onSearch: async () => {
          throw new Error('network unavailable');
        },
      });

      const result = await tool.execute({ query: 'agentool' }, toolOpts);

      expect(result).toContain('Error [web-search]: network unavailable');
    });

    it('rejects too-short queries through its input schema', () => {
      const result = createWebSearch().inputSchema.safeParse({ query: 'x' });
      expect(result.success).toBe(false);
    });
  });
});
