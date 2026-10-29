import { deserializeWorkspaceSnapshot } from '@/features/workspace/application/use-cases/deserializeWorkspaceSnapshot';
import { hydrateWorkspaceSnapshot } from '@/features/workspace/application/use-cases/hydrateWorkspaceSnapshot';
import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Loads one embedded snapshot through the same workspace hydration used by the online host. */
export function loadEmbeddedWorkspaceSnapshot(serialized: string): WorkspaceLoadResult {
  try {
    return { ok: true, value: hydrateWorkspaceSnapshot(deserializeWorkspaceSnapshot(serialized)) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to load Atlas workspace snapshot.',
    };
  }
}
