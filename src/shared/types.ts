/**
 * Base configuration shared by all agentool tools.
 * Every tool's factory function accepts a config extending this type.
 *
 * @example
 * ```typescript
 * import type { BaseToolConfig } from 'agentool';
 * const config: BaseToolConfig = { cwd: '/my/project' };
 * ```
 */
export interface BaseToolConfig {
  /**
   * Working directory for file operations.
   * Defaults to process.cwd() when not specified.
   */
  cwd?: string;
}

/**
 * Result returned by tool execute functions.
 * Tools always return strings -- never throw.
 * Error results include operation, error type, and remediation.
 *
 * @example
 * ```typescript
 * import type { ToolResult } from 'agentool';
 * const result: ToolResult = 'Found 3 matches in src/index.ts';
 * ```
 */
export type ToolResult = string;

/**
 * Configuration for tools that support timeouts.
 * Extends {@link BaseToolConfig} with an optional timeout duration.
 *
 * @example
 * ```typescript
 * import type { TimeoutConfig } from 'agentool';
 * const config: TimeoutConfig = { cwd: '/project', timeout: 30000 };
 * ```
 */
export interface TimeoutConfig extends BaseToolConfig {
  /** Timeout in milliseconds. Defaults vary by tool. */
  timeout?: number;
}
