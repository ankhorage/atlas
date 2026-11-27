import { isWorkspaceSelectionSource } from '@/features/workspace/application/use-cases/isWorkspaceSelectionSource';

/** Expose credential-free branch names after server-side source and repository validation. */
export function createWorkspaceBranchesRoute(branchesAsync: WorkspaceBranchesAsync) {
  return async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const source = url.searchParams.get('source');
    const repositoryId = url.searchParams.get('repositoryId');
    if (!isWorkspaceSelectionSource(source) || !isRepositoryId(repositoryId))
      return Response.json({ error: 'Invalid workspace branch request.' }, { status: 400 });
    try {
      return Response.json(await branchesAsync(source, repositoryId, request), {
        headers: noStoreHeaders,
      });
    } catch {
      return Response.json({ error: 'Unable to discover repository branches.' }, { status: 502 });
    }
  };
}

/** Keep browser repository identifiers opaque at the HTTP boundary. */
function isRepositoryId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\\/\s]/u.test(value)
  );
}

export type WorkspaceBranchesAsync = (
  source: string,
  repositoryId: string,
  request: Request
) => Promise<{
  readonly branches: readonly string[];
  readonly repository: { readonly defaultBranch: string };
}>;

const noStoreHeaders = { 'cache-control': 'no-store' };
