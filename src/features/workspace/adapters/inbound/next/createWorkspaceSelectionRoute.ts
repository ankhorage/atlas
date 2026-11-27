import { isRecord } from '@ankhorage/utility/object';

import { createWorkspaceProgressResponse } from '@/features/workspace/adapters/inbound/next/createWorkspaceProgressResponse';
import { isWorkspaceBranchName } from '@/features/workspace/application/use-cases/isWorkspaceBranchName';
import {
  isWorkspaceSelectionSource,
  normalizeWorkspaceSelectionSource,
} from '@/features/workspace/application/use-cases/isWorkspaceSelectionSource';
import { WorkspaceRepositoryRuntimeError } from '@/features/workspace/composition/createWorkspaceRepositoryRuntime';
import type { WorkspaceSelectionRequest } from '@/types/workspace';

/*** Validate a selection diff before composing its request-scoped streaming operation. */
export function createWorkspaceSelectionRoute(selectionAsync: WorkspaceSelectionAsync) {
  return async function POST(request: Request): Promise<Response> {
    let input: WorkspaceSelectionRequest;
    try {
      const body: unknown = await request.json();
      if (!isSelectionRequest(body))
        return Response.json({ error: 'Invalid workspace selection request.' }, { status: 400 });
      input = { ...body, source: normalizeWorkspaceSelectionSource(body.source) };
    } catch {
      return Response.json({ error: 'Invalid workspace selection request.' }, { status: 400 });
    }
    try {
      const operation = await selectionAsync(input, request);
      return createWorkspaceProgressResponse(input.generation, operation.runAsync);
    } catch (error) {
      return selectionFailureResponse(error);
    }
  };
}

/*** Reject URLs, duplicate identifiers, and non-diff initial requests at the untrusted HTTP boundary. */
function isSelectionRequest(value: unknown): value is WorkspaceSelectionRequest {
  if (
    !isRecord(value) ||
    !isWorkspaceSelectionSource(value.source) ||
    !isGeneration(value.generation)
  )
    return false;
  if (value.branchSelections !== undefined && !isBranchSelections(value.branchSelections))
    return false;
  if (
    !isIdentifierArray(value.addedRepositoryIds) ||
    !isIdentifierArray(value.removedRepositoryIds)
  )
    return false;
  if (value.runtimeId !== undefined && !isOpaqueIdentifier(value.runtimeId)) return false;
  if (
    new Set([...value.addedRepositoryIds, ...value.removedRepositoryIds]).size !==
    value.addedRepositoryIds.length + value.removedRepositoryIds.length
  )
    return false;
  return value.runtimeId !== undefined || value.removedRepositoryIds.length === 0;
}

/** Validate bounded Git branch names without accepting URLs, control characters, or secrets. */
function isBranchSelections(value: unknown): value is Readonly<Record<string, string>> {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 256 &&
    Object.entries(value).every(
      ([repositoryId, branch]) => isOpaqueIdentifier(repositoryId) && isWorkspaceBranchName(branch)
    )
  );
}

/*** Bound client generation values so a stale browser request cannot exhaust transport parsing. */
function isGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/*** Keep opaque repository and runtime identities away from paths, URLs, and unbounded input. */
function isOpaqueIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\\/\s]/u.test(value)
  );
}

/*** Guard the discovery validation path against pathological request-array sizes. */
function isIdentifierArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= 256 &&
    value.every(isOpaqueIdentifier) &&
    new Set(value).size === value.length
  );
}

/*** Return recoverable runtime loss before starting an NDJSON stream. */
function selectionFailureResponse(error: unknown): Response {
  if (!(error instanceof WorkspaceRepositoryRuntimeError))
    return Response.json({ error: 'Unable to apply workspace selection.' }, { status: 500 });
  const status = error.kind === 'unavailable' ? 410 : error.kind === 'rate-limited' ? 429 : 400;
  return Response.json(
    { error: error.message, recoverable: error.kind === 'unavailable' },
    { status }
  );
}

interface WorkspaceSelectionOperation {
  readonly runAsync: Parameters<typeof createWorkspaceProgressResponse>[1];
}

type WorkspaceSelectionAsync = (
  input: WorkspaceSelectionRequest,
  request: Request
) => Promise<WorkspaceSelectionOperation>;
