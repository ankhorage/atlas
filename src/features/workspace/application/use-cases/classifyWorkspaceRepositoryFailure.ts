import type {
  WorkspaceRepositoryFailure,
  WorkspaceRepositoryFailureCategory,
} from '@/types/workspace';

/*** Convert only observable transport facts into a bounded, browser-safe repository failure. */
export function classifyWorkspaceRepositoryFailure(error: unknown): WorkspaceRepositoryFailure {
  if (isAbort(error)) return { category: 'cancelled' };
  const status = statusCode(error);
  if (status === 401) return { category: 'authentication' };
  if (status === 403) return { category: 'authorization' };
  if (status === 404) return { category: 'not-found' };
  if (status === 429)
    return {
      category: isSecondaryRateLimit(error) ? 'secondary-rate-limit' : 'primary-rate-limit',
      ...(retryAfterSeconds(error) === undefined
        ? {}
        : { retryAfterSeconds: retryAfterSeconds(error) }),
    };
  if (status !== undefined && status >= 500 && status <= 599) return { category: 'upstream' };
  if (isTimeout(error)) return { category: 'timeout' };
  if (isParsing(error)) return { category: 'parsing' };
  if (isRuntimeLimit(error)) return { category: 'runtime-limit' };
  return { category: 'unknown' };
}

/*** Return only a prewritten explanation for a classified failure. */
export function workspaceRepositoryFailureDescription(failure: WorkspaceRepositoryFailure): string {
  const descriptions: Record<WorkspaceRepositoryFailureCategory, string> = {
    authentication: 'GitHub authentication is required to analyze this repository.',
    authorization: 'GitHub did not authorize access to this repository.',
    cancelled: 'Loading was cancelled.',
    'not-found': 'The repository or requested revision was not found.',
    'primary-rate-limit': 'GitHub rate limiting delayed this repository.',
    'secondary-rate-limit': 'GitHub secondary rate limiting delayed this repository.',
    parsing: 'The repository could not be analyzed because its source could not be parsed.',
    'runtime-limit': 'The repository exceeded an Atlas runtime resource limit.',
    timeout: 'The repository operation timed out.',
    unknown: 'The repository could not be analyzed. Retry to obtain a fresh diagnostic.',
    upstream: 'GitHub or an upstream service was temporarily unavailable.',
  };
  const retry = failure.retryAfterSeconds;
  return retry === undefined
    ? descriptions[failure.category]
    : `${descriptions[failure.category]} Retry after ${retry} seconds.`;
}

/*** Detect intentional cancellation without reading an arbitrary error message. */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

/*** Read a conventional numeric HTTP status without retaining the response or body. */
function statusCode(error: unknown): number | undefined {
  if (error instanceof Response) return error.status;
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const { status } = error;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

/*** Treat an explicit secondary-rate-limit marker as evidence; otherwise leave the 429 primary. */
function isSecondaryRateLimit(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'rateLimitKind' in error &&
    error.rateLimitKind === 'secondary'
  );
}

/*** Extract a bounded Retry-After value only when an adapter exposed it numerically. */
function retryAfterSeconds(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('retryAfterSeconds' in error))
    return undefined;
  const { retryAfterSeconds: retryAfter } = error;
  return typeof retryAfter === 'number' &&
    Number.isInteger(retryAfter) &&
    retryAfter >= 0 &&
    retryAfter <= 86_400
    ? retryAfter
    : undefined;
}

/*** Classify standard timeout names without forwarding their potentially sensitive details. */
function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'ETIMEDOUT');
}

/*** Classify parser adapters that deliberately expose a stable error class. */
function isParsing(error: unknown): boolean {
  return error instanceof Error && error.name === 'SyntaxError';
}

/*** Classify explicit resource-limit error names emitted by serverless and materialization adapters. */
function isRuntimeLimit(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'RangeError' || error.name === 'ResourceLimitError')
  );
}
