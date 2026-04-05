import { describe, it, expect } from 'vitest';
import { createSleep, sleep } from '../../src/sleep/index.js';

describe('sleep tool', () => {
  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(sleep).toBeDefined();
      expect(typeof sleep.execute).toBe('function');
    });

    it('has a description string', () => {
      expect(typeof sleep.description).toBe('string');
      expect(sleep.description.length).toBeGreaterThan(0);
    });

    it('has an input schema defined', () => {
      expect(sleep.inputSchema).toBeDefined();
    });
  });

  describe('sleep(0)', () => {
    it('returns immediately (under 50ms)', async () => {
      const start = Date.now();
      const result = await sleep.execute({ durationMs: 0 }, {
        toolCallId: 'test',
        messages: [],
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result).toContain('Slept for');
    });
  });

  describe('sleep(500)', () => {
    it('pauses for approximately 500ms (±50ms)', async () => {
      const start = Date.now();
      const result = await sleep.execute({ durationMs: 500 }, {
        toolCallId: 'test',
        messages: [],
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(450);
      expect(elapsed).toBeLessThanOrEqual(550);
      expect(result).toContain('Slept for');
    });
  });

  describe('reason', () => {
    it('includes reason in the output when provided', async () => {
      const result = await sleep.execute(
        { durationMs: 0, reason: 'rate limit' },
        { toolCallId: 'test', messages: [] },
      );
      expect(result).toContain('Reason: rate limit');
    });

    it('omits reason text when not provided', async () => {
      const result = await sleep.execute(
        { durationMs: 0 },
        { toolCallId: 'test', messages: [] },
      );
      expect(result).not.toContain('Reason:');
    });
  });

  describe('clamping', () => {
    it('clamps durations exceeding maxDuration to the max', async () => {
      const shortTool = createSleep({ maxDuration: 50 });
      const result = await shortTool.execute(
        { durationMs: 999 },
        { toolCallId: 'test', messages: [] },
      );
      expect(result).toContain('clamped from 999ms to 50ms');
      expect(result).toContain('max: 50ms');
    });

    it('clamps negative durations to 0', async () => {
      const start = Date.now();
      const result = await sleep.execute(
        { durationMs: -100 },
        { toolCallId: 'test', messages: [] },
      );
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result).toContain('clamped from -100ms to 0ms');
    });
  });

  describe('createSleep factory', () => {
    it('accepts empty config and uses defaults', () => {
      const tool = createSleep();
      expect(tool).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    });

    it('respects custom maxDuration', async () => {
      const tool = createSleep({ maxDuration: 100 });
      const result = await tool.execute(
        { durationMs: 200 },
        { toolCallId: 'test', messages: [] },
      );
      expect(result).toContain('clamped from 200ms to 100ms');
      expect(result).toContain('max: 100ms');
    });

    it('allows sleep up to custom maxDuration without clamping', async () => {
      const tool = createSleep({ maxDuration: 100 });
      const result = await tool.execute(
        { durationMs: 50 },
        { toolCallId: 'test', messages: [] },
      );
      expect(result).not.toContain('clamped');
      expect(result).toContain('Slept for');
    });
  });
});
