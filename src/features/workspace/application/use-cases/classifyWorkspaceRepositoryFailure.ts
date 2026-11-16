import { workspaceRepositoryOperationDiagnostic } from '@/features/workspace/application/use-cases/diagnoseWorkspaceRepositoryOperationAsync';
import type {
  WorkspaceRepositoryFailure,
  WorkspaceRepositoryFailureCategory,
} from '@/types/workspace';

/*** Convert only observable transport facts into a bounded, browser-safe repository failure. */
export function classifyWorkspaceRepositoryFailure(error: unknown): WorkspaceRepositoryFailure {
  const diagnostic = workspaceRepositoryOperationDiagnostic(error);
  const cause = diagnostic?.cause ?? error;
  const context =
    diagnostic === undefined
      ? {}
      : { correlationId: diagnostic.correlationId, stage: diagnostic.stage };
  if (isAbort(cause)) return { category: 'cancelled', ...context };
  const category =
    repositoryErrorCategory(cause) ??
    transportErrorCategory(cause) ??
    localErrorCategory(cause) ??
    'unknown';
  return isRateLimited(category)
    ? { category, ...context, ...retryAfter(cause) }
    : { category, ...context };
}

/*** Classify stable Repository package codes without retaining a provider error object. */
function repositoryErrorCategory(error: unknown): WorkspaceRepositoryFailureCategory | undefined {
  switch (repositoryErrorCode(error)) {
    case 'owner-not-found':
      return 'not-found';
    case 'permission-denied':
      return 'authorization';
    case 'rate-limited':
      return 'rate-limited';
    case 'timeout':
      return 'timeout';
  }
}

/*** Classify safe HTTP and adapter rate-limit facts without treating an ambiguous 403 as throttling. */
function transportErrorCategory(error: unknown): WorkspaceRepositoryFailureCategory | undefined {
  const status = statusCode(error);
  switch (status) {
    case 401:
      return 'authentication';
    case 404:
      return 'not-found';
  }
  const rateLimitKind = rateLimitKindFrom(error);
  if (rateLimitKind !== undefined) return rateLimitKind;
  if (status === 429) return 'rate-limited';
  return status !== undefined && status >= 500 && status <= 599 ? 'upstream' : undefined;
}

/*** Classify bounded Atlas operation failures after external transport facts have been exhausted. */
function localErrorCategory(error: unknown): WorkspaceRepositoryFailureCategory | undefined {
  if (isTimeout(error)) return 'timeout';
  if (isParsing(error)) return 'parsing';
  return isRuntimeLimit(error) ? 'runtime-limit' : undefined;
}

/*** Identify categories that may safely include bounded retry timing. */
function isRateLimited(category: WorkspaceRepositoryFailureCategory): boolean {
  return (
    category === 'primary-rate-limit' ||
    category === 'rate-limited' ||
    category === 'secondary-rate-limit'
  );
}

/*** Return only a prewritten explanation for a classified failure. */
export function workspaceRepositoryFailureDescription(failure: WorkspaceRepositoryFailure): string {
  const descriptions: Record<WorkspaceRepositoryFailureCategory, string> = {
    authentication: 'GitHub authentication is required to analyze this repository.',
    authorization: 'GitHub did not authorize access to this repository.',
    cancelled: 'Loading was cancelled.',
    'not-found': 'The repository or requested revision was not found.',
    'primary-rate-limit': 'GitHub rate limiting delayed this repository.',
    'rate-limited': 'This repository is temporarily rate limited. Retry shortly.',
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

/*** Accept only an adapter-provided, bounded rate-limit kind rather than inferring it from HTTP status. */
function rateLimitKindFrom(
  error: unknown
): 'primary-rate-limit' | 'secondary-rate-limit' | undefined {
  if (typeof error !== 'object' || error === null || !('rateLimitKind' in error)) return undefined;
  return error.rateLimitKind === 'primary'
    ? 'primary-rate-limit'
    : error.rateLimitKind === 'secondary'
      ? 'secondary-rate-limit'
      : undefined;
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

/** Translate the Repository package's bounded millisecond delay to a browser-safe second count. */
function retryAfter(error: unknown): { readonly retryAfterSeconds?: number } {
  const seconds = retryAfterSeconds(error) ?? retryAfterMilliseconds(error);
  return seconds === undefined ? {} : { retryAfterSeconds: seconds };
}

/** Read published Repository rate-limit timing without forwarding provider headers or bodies. */
function retryAfterMilliseconds(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('retryAfterMilliseconds' in error))
    return undefined;
  const { retryAfterMilliseconds: milliseconds } = error;
  const seconds = typeof milliseconds === 'number' ? Math.ceil(milliseconds / 1_000) : NaN;
  return Number.isInteger(seconds) && seconds >= 0 && seconds <= 86_400 ? seconds : undefined;
}

/** Recognize only the published credential-free Repository error codes. */
function repositoryErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const { code } = error;
  return typeof code === 'string' ? code : undefined;
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
