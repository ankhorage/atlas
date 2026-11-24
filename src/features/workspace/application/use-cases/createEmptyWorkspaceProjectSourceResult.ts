import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Produces the picker-first workspace state without loading an implicit project. */
export function createEmptyWorkspaceProjectSourceResult(): {
  readonly projectName: string;
  readonly selectionRequired: true;
  readonly workspace: WorkspaceLoadResult;
} {
  return {
    projectName: 'Choose GitHub repositories',
    selectionRequired: true,
    workspace: { ok: false, error: 'Choose one or more repositories to inspect.' },
  };
}
