export type JsonPointerResolution =
  | { found: true; value: unknown }
  | { found: false; value?: never };

export function resolveJsonPointer(
  value: unknown,
  pointer: string | undefined,
): JsonPointerResolution {
  if (pointer === undefined) {
    return { found: false };
  }

  if (pointer === '') {
    return { found: true, value };
  }

  if (!pointer.startsWith('/')) {
    return { found: false };
  }

  let current = value;
  for (const segment of pointer.slice(1).split('/').map(unescapeJsonPointerSegment)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false };
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false };
    }

    current = current[segment];
  }

  return { found: true, value: current };
}

export function schemaPathToJsonPointer(
  schemaPath: string | undefined,
): string | undefined {
  if (!schemaPath || schemaPath === '#') {
    return '';
  }

  return schemaPath.startsWith('#/')
    ? schemaPath.slice(1)
    : undefined;
}

export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 3)}...`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}
