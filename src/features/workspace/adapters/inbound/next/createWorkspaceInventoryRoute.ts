import { isWorkspaceSelectionSource } from '@/features/workspace/application/use-cases/isWorkspaceSelectionSource';
import type { WorkspaceRepositoryInventoryOption } from '@/types/workspace';

/*** Expose only the credential-free repository inventory authorized for one normalized GitHub source. */
export function createWorkspaceInventoryRoute(inventoryAsync: WorkspaceInventoryAsync) {
  return async function GET(request: Request): Promise<Response> {
    const owner = new URL(request.url).searchParams.get('owner');
    if (!isWorkspaceSelectionSource(owner))
      return Response.json({ error: 'Invalid workspace inventory source.' }, { status: 400 });
    try {
      return Response.json(await inventoryAsync(owner, request), { headers: noStoreHeaders });
    } catch {
      return Response.json({ error: 'Unable to discover workspace inventory.' }, { status: 502 });
    }
  };
}

export type WorkspaceInventoryAsync = (
  owner: string,
  request: Request
) => Promise<{
  readonly owner: string;
  readonly repositories: readonly WorkspaceRepositoryInventoryOption[];
}>;

const noStoreHeaders = { 'cache-control': 'no-store' };
