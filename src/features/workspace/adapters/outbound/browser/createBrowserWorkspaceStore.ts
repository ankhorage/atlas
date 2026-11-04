import {
  reconcileWorkspaceDefinitions,
  type WorkspaceDefinitionOperation,
} from '@/features/workspace/application/use-cases/reconcileWorkspaceDefinitions';
import { validateWorkspaceDefinitions } from '@/features/workspace/application/use-cases/validateWorkspaceDefinitions';
import type { WorkspaceDefinition } from '@/types/workspace';

/*** Create the anonymous browser-local persistence boundary for named workspace definitions. */
export function createBrowserWorkspaceStore(storage: Storage): BrowserWorkspaceStore {
  const load = (): readonly WorkspaceDefinition[] => {
    try {
      const value = storage.getItem(WORKSPACE_STORAGE_KEY);
      return value === null ? [] : (validateWorkspaceDefinitions(JSON.parse(value)) ?? []);
    } catch {
      return [];
    }
  };
  return {
    load,
    apply: operation => {
      const definitions = reconcileWorkspaceDefinitions(load(), operation);
      storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(definitions));
      return definitions;
    },
  };
}

export interface BrowserWorkspaceStore {
  readonly load: () => readonly WorkspaceDefinition[];
  readonly apply: (operation: WorkspaceDefinitionOperation) => readonly WorkspaceDefinition[];
}

const WORKSPACE_STORAGE_KEY = 'atlas.workspace-definitions.v1';
