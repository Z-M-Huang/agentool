import { isRecord } from './json-pointer.js';

export function hasOneOfDiscriminator(
  schema: unknown,
  seen = new Set<object>(),
): boolean {
  if (!isRecord(schema) && !Array.isArray(schema)) {
    return false;
  }

  if (seen.has(schema)) {
    return false;
  }
  seen.add(schema);

  if (isRecord(schema) &&
    isRecord(schema.discriminator) &&
    typeof schema.discriminator.propertyName === 'string' &&
    Array.isArray(schema.oneOf)) {
    return true;
  }

  const values = Array.isArray(schema) ? schema : Object.values(schema);
  return values.some((value) => hasOneOfDiscriminator(value, seen));
}
