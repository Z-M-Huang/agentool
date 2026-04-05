/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * @param error - The caught value (typically `Error` or a string).
 * @returns The error message string.
 */
export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
