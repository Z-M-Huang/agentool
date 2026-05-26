import type {
  JsonSchema,
  OutputValidationError,
  OutputValidatorErrorMode,
} from './index.js';
import {
  isRecord,
  resolveJsonPointer,
  schemaPathToJsonPointer,
  truncate,
  type JsonPointerResolution,
} from './json-pointer.js';

export interface AjvValidationError {
  keyword: string;
  instancePath: string;
  schemaPath?: string;
  params: Record<string, unknown>;
  message?: string;
}

export interface FormatAjvErrorOptions {
  data: unknown;
  schema: JsonSchema | undefined;
  errorMode: OutputValidatorErrorMode;
}

export function formatAjvErrors(
  errors: AjvValidationError[] | null | undefined,
  options: FormatAjvErrorOptions,
): OutputValidationError[] {
  const collapsed = collapseUnionErrors(errors ?? [], options);
  const formatted = collapsed.map((error) => formatAjvError(error, options.data));
  return applyErrorMode(formatted, options.errorMode);
}

function formatAjvError(
  error: AjvValidationError,
  data: unknown,
): OutputValidationError {
  const instanceValue = getInstanceValue(data, error.instancePath);
  return {
    path: getErrorPath(error),
    message: error.message ?? `failed schema keyword "${error.keyword}"`,
    keyword: error.keyword,
    ...(instanceValue === undefined ? {} : { instanceValue }),
    schemaPath: error.schemaPath,
    params: error.params,
  };
}

function collapseUnionErrors(
  errors: AjvValidationError[],
  options: FormatAjvErrorOptions,
): AjvValidationError[] {
  const selectedBranches = getSelectedUnionBranches(errors, options);
  if (selectedBranches.size === 0) {
    return errors;
  }

  return errors.filter((error) => {
    const branchInfo = getUnionBranchInfo(error);
    if (!branchInfo) {
      return true;
    }

    const selectedBranch = selectedBranches.get(branchInfo.key);
    return selectedBranch === undefined || branchInfo.branchIndex === selectedBranch;
  });
}

function getSelectedUnionBranches(
  errors: AjvValidationError[],
  options: FormatAjvErrorOptions,
): Map<string, number> {
  const branchErrorsByUnion = new Map<string, Map<number, AjvValidationError[]>>();

  for (const error of errors) {
    const branchInfo = getUnionBranchInfo(error);
    if (!branchInfo) {
      continue;
    }

    const branchErrors = branchErrorsByUnion.get(branchInfo.key) ?? new Map();
    const errorsForBranch = branchErrors.get(branchInfo.branchIndex) ?? [];
    errorsForBranch.push(error);
    branchErrors.set(branchInfo.branchIndex, errorsForBranch);
    branchErrorsByUnion.set(branchInfo.key, branchErrors);
  }

  const selectedBranches = new Map<string, number>();
  for (const parentError of errors) {
    if (!isUnionKeyword(parentError.keyword) || !parentError.schemaPath) {
      continue;
    }

    const branchErrors = branchErrorsByUnion.get(parentError.schemaPath);
    if (!branchErrors || branchErrors.size === 0) {
      continue;
    }

    const discriminatorBranch = selectDiscriminatorBranch(
      parentError,
      branchErrors,
      options,
    );
    selectedBranches.set(
      parentError.schemaPath,
      discriminatorBranch ?? selectFewestErrorsBranch(branchErrors),
    );
  }

  return selectedBranches;
}

function getUnionBranchInfo(error: AjvValidationError): UnionBranchInfo | undefined {
  const schemaPath = error.schemaPath;
  if (!schemaPath) {
    return undefined;
  }

  const match = /^(.*\/(?:anyOf|oneOf))\/(\d+)(?:\/|$)/.exec(schemaPath);
  if (!match) {
    return undefined;
  }

  return {
    key: match[1],
    branchIndex: Number(match[2]),
  };
}

function selectDiscriminatorBranch(
  parentError: AjvValidationError,
  branchErrors: Map<number, AjvValidationError[]>,
  options: FormatAjvErrorOptions,
): number | undefined {
  const schemaBranches = resolveJsonPointer(
    options.schema,
    schemaPathToJsonPointer(parentError.schemaPath),
  );
  const inputValue = resolveJsonPointer(options.data, parentError.instancePath);
  if (!schemaBranches.found || !Array.isArray(schemaBranches.value) ||
    !inputValue.found || !isRecord(inputValue.value)) {
    return undefined;
  }

  const inputRecord = inputValue.value;
  const matchingBranches = new Set<number>();
  for (const [branchIndex] of branchErrors) {
    const branch = schemaBranches.value[branchIndex];
    if (!isRecord(branch) || !isRecord(branch.properties)) {
      continue;
    }

    for (const [propertyName, propertySchema] of Object.entries(branch.properties)) {
      if (!Object.prototype.hasOwnProperty.call(inputRecord, propertyName)) {
        continue;
      }

      const allowedValue = getSingleAllowedValue(propertySchema);
      if (allowedValue.found &&
        jsonScalarEquals(inputRecord[propertyName], allowedValue.value)) {
        matchingBranches.add(branchIndex);
      }
    }
  }

  return matchingBranches.size === 1
    ? [...matchingBranches][0]
    : undefined;
}

function selectFewestErrorsBranch(
  branchErrors: Map<number, AjvValidationError[]>,
): number {
  let selectedBranch: number | undefined;
  let selectedCount = Number.POSITIVE_INFINITY;

  for (const [branchIndex, errors] of branchErrors) {
    if (errors.length < selectedCount ||
      (errors.length === selectedCount &&
        (selectedBranch === undefined || branchIndex < selectedBranch))) {
      selectedBranch = branchIndex;
      selectedCount = errors.length;
    }
  }

  return selectedBranch ?? 0;
}

function applyErrorMode(
  errors: OutputValidationError[],
  errorMode: OutputValidatorErrorMode,
): OutputValidationError[] {
  if (errorMode === 'all') {
    return errors;
  }

  if (errorMode === 'first') {
    const firstError = errors.find((error) => isUnionKeyword(error.keyword)) ??
      errors[0];
    return firstError ? [firstError] : [];
  }

  const result: OutputValidationError[] = [];
  const seenPaths = new Set<string>();
  for (const error of errors) {
    if (isUnionKeyword(error.keyword)) {
      result.push(error);
      continue;
    }

    if (seenPaths.has(error.path)) {
      continue;
    }

    seenPaths.add(error.path);
    result.push(error);
  }

  return result;
}

function getErrorPath(error: AjvValidationError): string {
  if (error.keyword === 'required') {
    const missing = getMissingProperty(error.params);
    if (missing) {
      return appendJsonPointer(error.instancePath, missing);
    }
  }

  return error.instancePath || '/';
}

function getMissingProperty(params: Record<string, unknown>): string | undefined {
  const missing = params.missingProperty;
  return typeof missing === 'string' && missing.length > 0
    ? missing
    : undefined;
}

function appendJsonPointer(base: string, segment: string): string {
  const prefix = base && base !== '/' ? base : '';
  return `${prefix}/${escapeJsonPointerSegment(segment)}`;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function getInstanceValue(data: unknown, instancePath: string): string | undefined {
  const resolved = resolveJsonPointer(data, instancePath);
  if (!resolved.found) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(resolved.value);
    if (serialized === undefined) {
      return undefined;
    }
    return truncate(serialized, 200);
  } catch {
    return undefined;
  }
}

function isUnionKeyword(keyword: string): keyword is 'anyOf' | 'oneOf' {
  return keyword === 'anyOf' || keyword === 'oneOf';
}

function getSingleAllowedValue(schema: unknown): JsonPointerResolution {
  if (!isRecord(schema)) {
    return { found: false };
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return { found: true, value: schema.const };
  }

  return Array.isArray(schema.enum) && schema.enum.length === 1
    ? { found: true, value: schema.enum[0] }
    : { found: false };
}

function jsonScalarEquals(left: unknown, right: unknown): boolean {
  return isJsonScalar(left) && isJsonScalar(right) && Object.is(left, right);
}

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  return value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';
}

type UnionBranchInfo = { key: string; branchIndex: number };
