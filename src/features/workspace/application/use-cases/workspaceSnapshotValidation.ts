import { isRecord } from '@ankhorage/utility/object';

/*** Supplies the common JSON-safe predicates used only by workspace snapshot boundary validators. */
export const workspaceSnapshotValidation = {
  isArrayOf,
  isBoolean,
  isFiniteNumber,
  isJsonValue,
  isOneOf,
  isOptional,
  isRecord,
  isString,
};

/*** Validates every member of an untrusted list while preserving predicate narrowing. */
function isArrayOf<Value>(
  value: unknown,
  predicate: (candidate: unknown) => candidate is Value
): value is readonly Value[];
function isArrayOf(
  value: unknown,
  predicate: (candidate: unknown) => boolean
): value is readonly unknown[];
function isArrayOf(
  value: unknown,
  predicate: (candidate: unknown) => boolean
): value is readonly unknown[] {
  return Array.isArray(value) && value.every(predicate);
}

/*** Narrows Boolean values for optional flags. */
function isBoolean(value: unknown): boolean {
  return typeof value === 'boolean';
}

/*** Narrows finite numbers accepted at the JSON boundary. */
function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/*** Checks recursively serializable evidence without accepting non-finite JSON numbers. */
function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isFiniteNumber(value)
  )
    return true;
  return Array.isArray(value)
    ? value.every(isJsonValue)
    : isRecord(value) && Object.values(value).every(isJsonValue);
}

/*** Narrows one string literal from an Atlas-owned fixed vocabulary. */
function isOneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

/*** Applies a predicate only when an optional value is present. */
function isOptional(value: unknown, predicate: (candidate: unknown) => boolean): boolean {
  return value === undefined || predicate(value);
}

/*** Narrows string values for nested records. */
function isString(value: unknown): boolean {
  return typeof value === 'string';
}
