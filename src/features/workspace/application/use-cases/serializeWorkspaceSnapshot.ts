import type { WorkspaceSnapshot } from '@/types/workspace';

/*** Serializes an Atlas workspace snapshot for a host-neutral embedded data boundary. */
export function serializeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(snapshot);
}
