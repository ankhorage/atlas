import type { WorkspaceDefinition } from '@/types/workspace';

/*** Apply one named-workspace operation without mutating unrelated saved definitions. */
export function reconcileWorkspaceDefinitions(
  definitions: readonly WorkspaceDefinition[],
  operation: WorkspaceDefinitionOperation
): readonly WorkspaceDefinition[] {
  if (operation.kind === 'save') {
    const withoutCurrent = definitions.filter(
      definition => definition.id !== operation.workspace.id
    );
    return [...withoutCurrent, operation.workspace];
  }
  if (operation.kind === 'rename') {
    return definitions.map(definition =>
      definition.id === operation.id ? { ...definition, name: operation.name } : definition
    );
  }
  return definitions.filter(definition => definition.id !== operation.id);
}

export type WorkspaceDefinitionOperation =
  | { readonly kind: 'save'; readonly workspace: WorkspaceDefinition }
  | { readonly kind: 'rename'; readonly id: string; readonly name: string }
  | { readonly kind: 'delete'; readonly id: string };
