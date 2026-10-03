'use client';

import { dedupeBy } from '@ankhorage/utility/array';
import { applySelectionIntent, type SelectionIntent } from '@ankhorage/utility/selection';
import { useMemo, useState } from 'react';

import { resolveGraphProjectTreeSelection } from '@/features/project-tree/application/use-cases/resolveGraphProjectTreeSelection';
import { resolveProjectTreeNavigation } from '@/features/project-tree/application/use-cases/resolveProjectTreeNavigation';
import { findProjectTreeNode } from '@/features/project-tree/utils/findProjectTreeNode';
import { resolveProjectTreeGraphNodeId } from '@/features/project-tree/utils/resolveProjectTreeGraphNodeId';
import type { ProjectTreeNode } from '@/types/projectTree';
import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Own package-scope navigation and the independent logical selection shared by TreeView and GraphView. */
export function useWorkspaceNavigation(workspace: WorkspaceLoadResult) {
  const [currentPackage, setCurrentPackage] = useState('');
  const packageGraph = workspace.ok ? workspace.value.packageGraph : null;
  const projectTree = workspace.ok ? workspace.value.tree : [];
  const packageIds = useMemo(
    () => packageGraph?.nodes.map(candidate => candidate.id) ?? [],
    [packageGraph]
  );
  const selection = useWorkspaceSelection({ packageIds, projectTree });

  /*** Navigate to one explicit graph package without rewriting the current selection. */
  const navigateToPackage = (path: string) => {
    setCurrentPackage(normalizeGraphPackage(path));
  };

  /*** Navigate graph scope from an independent folder expansion or collapse action. */
  const toggleProjectTreeNode = (node: ProjectTreeNode, expanded: boolean) => {
    if (node.kind !== 'directory') return;
    if (expanded) {
      setCurrentPackage(resolveProjectTreeNavigation(node, packageIds, currentPackage));
      return;
    }
    setCurrentPackage(resolveParentProjectTreeNavigation(projectTree, node, packageIds));
  };

  return {
    currentPackage,
    navigateToPackage,
    packageGraph,
    projectTree,
    toggleProjectTreeNode,
    ...selection,
  };
}

/*** Own semantic selection transitions without coupling them to package-scope navigation. */
function useWorkspaceSelection(input: WorkspaceSelectionInput) {
  const [selections, setSelections] = useState<readonly WorkspaceSelection[]>([]);
  const graphNodeIdSet = useMemo(() => new Set(input.packageIds), [input.packageIds]);
  const selectedGraphNodeIds = useMemo(
    () =>
      dedupeBy(
        selections.flatMap(selection =>
          selection.graphNodeId === null ? [] : [selection.graphNodeId]
        ),
        value => value
      ),
    [selections]
  );
  const selectedTreeIds = useMemo(
    () =>
      dedupeBy(
        selections.flatMap(selection =>
          selection.treeNodeId === null ? [] : [selection.treeNodeId]
        ),
        value => value
      ),
    [selections]
  );

  const selectProjectTreeNode = (node: ProjectTreeNode, intent: SelectionIntent) => {
    const next = resolveTreeWorkspaceSelection(node, input.packageIds);
    setSelections(previous => applyWorkspaceSelection(previous, next, intent));
  };

  const selectGraphNode = (id: string, intent: SelectionIntent) => {
    const next = resolveGraphWorkspaceSelection(id, input, graphNodeIdSet);
    if (next !== null) {
      setSelections(previous => applyWorkspaceSelection(previous, next, intent));
    }
  };

  return {
    selectedGraphNodeIds,
    selectedTreeIds,
    selectGraphNode,
    selectProjectTreeNode,
  };
}

/*** Apply one Utility-owned selection intent while retaining Atlas tree/graph mapping metadata. */
function applyWorkspaceSelection(
  previous: readonly WorkspaceSelection[],
  next: WorkspaceSelection,
  intent: SelectionIntent
): readonly WorkspaceSelection[] {
  const nextKey = getWorkspaceSelectionKey(next);
  const previousKeys = previous.map(getWorkspaceSelectionKey);
  const nextKeys = applySelectionIntent(previousKeys, nextKey, intent);
  const result = nextKeys.map(key => {
    if (key === nextKey) return next;
    return previous.find(selection => getWorkspaceSelectionKey(selection) === key) ?? next;
  });
  return areWorkspaceSelectionsEqual(previous, result) ? previous : result;
}

/*** Return one stable identity shared by synchronized TreeView and GraphView selection. */
function getWorkspaceSelectionKey(selection: WorkspaceSelection): string {
  return selection.graphNodeId === null
    ? `tree:${selection.treeNodeId ?? ''}`
    : `graph:${selection.graphNodeId}`;
}

/*** Compare ordered Atlas selection mappings without reallocating stable state. */
function areWorkspaceSelectionsEqual(
  left: readonly WorkspaceSelection[],
  right: readonly WorkspaceSelection[]
): boolean {
  return (
    left.length === right.length &&
    left.every((selection, index) => {
      const rightSelection = right.at(index);
      return (
        selection.graphNodeId === rightSelection?.graphNodeId &&
        selection.treeNodeId === rightSelection.treeNodeId
      );
    })
  );
}

/*** Resolve one TreeView activation to that exact row and its directly represented graph identity. */
function resolveTreeWorkspaceSelection(
  node: ProjectTreeNode,
  graphNodeIds: readonly string[]
): WorkspaceSelection {
  return {
    graphNodeId: resolveProjectTreeGraphNodeId(node, graphNodeIds),
    treeNodeId: node.id,
  };
}

/*** Resolve one GraphView activation to the same graph node and its exact matching TreeView row. */
function resolveGraphWorkspaceSelection(
  id: string,
  input: WorkspaceSelectionInput,
  graphNodeIdSet: ReadonlySet<string>
): WorkspaceSelection | null {
  const graphNodeId = normalizeGraphPackage(id);
  if (!graphNodeIdSet.has(graphNodeId)) return null;
  const treeNode = resolveGraphProjectTreeSelection(
    input.projectTree,
    graphNodeId,
    input.packageIds
  );
  return { graphNodeId, treeNodeId: treeNode?.id ?? null };
}

/*** Resolve a collapsed folder to the nearest represented ancestor scope, or Home when none exists. */
function resolveParentProjectTreeNavigation(
  nodes: readonly ProjectTreeNode[],
  node: ProjectTreeNode,
  graphNodeIds: readonly string[]
): string {
  const path = readDirectoryPath(node.id);
  if (path === null) return '';

  const segments = path.split('/').filter(Boolean);
  const parentIds = Array.from({ length: Math.max(0, segments.length - 1) }, (_, index) => {
    const length = segments.length - index - 1;
    return `directory:${segments.slice(0, length).join('/')}`;
  });

  for (const parentId of parentIds) {
    const parent = findProjectTreeNode(nodes, parentId);
    if (parent === null) continue;
    const resolved = resolveProjectTreeGraphNodeId(parent, graphNodeIds);
    if (resolved !== null) return resolved;
  }
  return '';
}

/*** Reads the stable filesystem path encoded in one directory tree id. */
function readDirectoryPath(id: string): string | null {
  const prefix = 'directory:';
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

/*** Normalize navigation paths to the package identity representation used by the graph view. */
function normalizeGraphPackage(path: string): string {
  return path.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}

interface WorkspaceSelectionInput {
  readonly packageIds: readonly string[];
  readonly projectTree: readonly ProjectTreeNode[];
}

interface WorkspaceSelection {
  readonly graphNodeId: string | null;
  readonly treeNodeId: string | null;
}
