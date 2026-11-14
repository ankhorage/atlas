import type { WorkspaceRepositoryInventoryOption } from '@/types/workspace';

/*** Expose only the credential-free repository inventory authorized for one normalized GitHub source. */
export function createWorkspaceInventoryRoute(inventoryAsync: WorkspaceInventoryAsync) {
  return async function GET(request: Request): Promise<Response> {
    const owner = new URL(request.url).searchParams.get('owner');
    if (!isSelectionSource(owner))
      return Response.json({ error: 'Invalid workspace inventory source.' }, { status: 400 });
    try {
      return Response.json(await inventoryAsync(owner, request), { headers: noStoreHeaders });
    } catch {
      return Response.json({ error: 'Unable to discover workspace inventory.' }, { status: 502 });
    }
  };
}

/*** Accept only one GitHub owner or the authenticated-user inventory sentinel. */
export function isSelectionSource(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === '@me' || /^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/u.test(value))
  );
}

/*** Canonicalize equivalent owner spellings before they become a runtime scope key. */
export function normalizeSelectionSource(source: string): string {
  return source === '@me' ? source : source.toLowerCase();
}

export type WorkspaceInventoryAsync = (
  owner: string,
  request: Request
) => Promise<{
  readonly owner: string;
  readonly repositories: readonly WorkspaceRepositoryInventoryOption[];
}>;

const noStoreHeaders = { 'cache-control': 'no-store' };
