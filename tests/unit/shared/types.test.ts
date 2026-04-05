import { describe, it, expect } from 'vitest';
import type { BaseToolConfig, TimeoutConfig, ToolResult } from '../../../src/shared/types.js';

describe('BaseToolConfig', () => {
  it('accepts an empty object (all fields optional)', () => {
    const config: BaseToolConfig = {};
    expect(config).toEqual({});
  });

  it('accepts a cwd string', () => {
    const config: BaseToolConfig = { cwd: '/my/project' };
    expect(config.cwd).toBe('/my/project');
  });
});

describe('ToolResult', () => {
  it('is assignable from a string literal', () => {
    const result: ToolResult = 'Found 3 matches';
    expect(typeof result).toBe('string');
  });

  it('is assignable from a template string', () => {
    const count = 5;
    const result: ToolResult = `Found ${count} files`;
    expect(result).toBe('Found 5 files');
  });
});

describe('TimeoutConfig', () => {
  it('extends BaseToolConfig with cwd and timeout', () => {
    const config: TimeoutConfig = { cwd: '/project', timeout: 30000 };
    expect(config.cwd).toBe('/project');
    expect(config.timeout).toBe(30000);
  });

  it('accepts cwd without timeout (timeout is optional)', () => {
    const config: TimeoutConfig = { cwd: '/project' };
    expect(config.cwd).toBe('/project');
    expect(config.timeout).toBeUndefined();
  });

  it('accepts an empty object (all fields optional)', () => {
    const config: TimeoutConfig = {};
    expect(config).toEqual({});
  });

  it('is assignable to BaseToolConfig (structural subtype)', () => {
    const timeout: TimeoutConfig = { cwd: '/x', timeout: 5000 };
    const base: BaseToolConfig = timeout;
    expect(base.cwd).toBe('/x');
  });
});
