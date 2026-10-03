'use client';

import { useMemo, useState } from 'react';

import { getSelectableGraphNodeIds } from '@/features/graph-view/domain/getSelectableGraphNodeIds';
import { resolveGraphProjectTreeSelection } from '@/features/project-tree/application/use-cases/resolveGraphProjectTreeSelection';
import { resolveProjectTreeNavigation } from '@/features/project-tree/application/use-cases/resolveProjectTreeNavigation';
import { resolveProjectTreeSelection } from '@/features/project-tree/application/use-cases/resolveProjectTreeSelection';
import { findProjectTreeNodeByGraphPackage } from '@/features/project-tree/utils/findProjectTreeNodeByGraphPackage';
import type { ProjectTreeNode } from '@/types/projectTree';
import type { WorkspaceLoadResult } from '@/types/workspace';

/*** Own the single logical selection shared by workspace TreeView and GraphView surfaces. */
export function useWorkspaceNavigation(workspace: WorkspaceLoadResult) {
  const [currentPackage, setCurrentPackage] = useState('');
  const packageGraph = workspace.ok ? workspace.value.packageGraph : null;
  const projectTree = workspace.ok ? workspace.value.tree : [];
  const packageIds = useMemo(
    () => packageGraph?.nodes.map(candidate => candidate.id) ?? [],
    [packageGraph]
  );
  const selectableGraphNodeIds = useMemo(
    () => (packageGraph === null ? [] : getSelectableGraphNodeIds(packageGraph)),
    [packageGraph]
  );
  const selection = useWorkspaceSelection({
    currentPackage,
    packageIds,
    projectTree,
    selectableGraphNodeIds,
    setCurrentPackage,
  });

  /*** Navigate graph scope and mirror its tree location without inventing a graph selection. */
  const navigateToPackage = (path: string) => {
    const packageName = normalizeGraphPackage(path);
    const matchingTreeNode = findProjectTreeNodeByGraphPackage(projectTree, packageName);
    setCurrentPackage(packageName);
    selection.setTreeOnly(matchingTreeNode?.id ?? null);
  };

  return {
    currentPackage,
    navigateToPackage,
    packageGraph,
    projectTree,
    ...selection.publicState,
  };
}

/*** Own selection transitions separately from package-scope navigation. */
function useWorkspaceSelection(input: WorkspaceSelectionInput) {
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const selectableGraphNodeIdSet = useMemo(
    () => new Set(input.selectableGraphNodeIds),
    [input.selectableGraphNodeIds]
  );

  const selectProjectTreeNode = (node: ProjectTreeNode) => {
    const result = resolveTreeWorkspaceSelection(node, input.selectableGraphNodeIds);
    setSelection(previous => keepStableSelection(previous, result.selection));
    if (result.resolvedNode === null) return;
    input.setCurrentPackage(
      resolveProjectTreeNavigation(result.resolvedNode, input.packageIds, input.currentPackage)
    );
  };

  const selectGraphNode = (id: string) => {
    const next = resolveGraphWorkspaceSelection(id, input, selectableGraphNodeIdSet);
    if (next !== null) setSelection(previous => keepStableSelection(previous, next));
  };

  const unselectGraphNode = (id: string) => {
    const graphNodeId = normalizeGraphPackage(id);
    setSelection(previous => (previous?.graphNodeId === graphNodeId ? null : previous));
  };

  return {
    publicState: {
      selectedGraphNodeId: selection?.graphNodeId ?? null,
      selectedTreeId: selection?.treeNodeId ?? null,
      selectGraphNode,
      selectProjectTreeNode,
      unselectGraphNode,
    },
    setTreeOnly: (treeNodeId: string | null) =>
      setSelection(
        treeNodeId === null ? null : { graphNodeId: null, treeNodeId }
      ),
  };
}

/*** Resolve one TreeView click into the canonical logical workspace selection. */
function resolveTreeWorkspaceSelection(
  node: ProjectTreeNode,
  selectableGraphNodeIds: readonly string[]
): TreeWorkspaceSelectionResult {
  const resolvedNode = resolveProjectTreeSelection(node, selectableGraphNodeIds);
  return {
    resolvedNode,
    selection: {
      graphNodeId:
        resolvedNode === null ? null : normalizeGraphPackage(resolvedNode.graphPackage),
      treeNodeId: resolvedNode?.id ?? node.id,
    },
  };
}

/*** Resolve one GraphView click into the canonical logical workspace selection. */
function resolveGraphWorkspaceSelection(
  id: string,
  input: WorkspaceSelectionInput,
  selectableGraphNodeIdSet: ReadonlySet<string>
): WorkspaceSelection | null {
  const graphNodeId = normalizeGraphPackage(id);
  const treeNode = resolveGraphProjectTreeSelection(
    input.projectTree,
    graphNodeId,
    input.selectableGraphNodeIds
  );
  const resolvedGraphNodeId =
    treeNode === null
      ? selectableGraphNodeIdSet.has(graphNodeId)
        ? graphNodeId
        : null
      : normalizeGraphPackage(treeNode.graphPackage);
  if (resolvedGraphNodeId === null) return null;
  return { graphNodeId: resolvedGraphNodeId, treeNodeId: treeNode?.id ?? null };
}

/*** Reuse an equal selection object so controlled GraphView callbacks cannot create render loops. */
function keepStableSelection(
  previous: WorkspaceSelection | null,
  next: WorkspaceSelection
): WorkspaceSelection {
  return previous?.graphNodeId === next.graphNodeId && previous.treeNodeId === next.treeNodeId
    ? previous
    : next;
}

/*** Normalize navigation paths to the package identity representation used by the graph view. */
function normalizeGraphPackage(path: string): string {
  return path.replaceAll('/', '.').replace(/^\.+|\.+$/g, '');
}

interface WorkspaceSelectionInput {
  readonly currentPackage: string;
  readonly packageIds: readonly string[];
  readonly projectTree: readonly ProjectTreeNode[];
  readonly selectableGraphNodeIds: readonly string[];
  readonly setCurrentPackage: (path: string) => void;
}

interface WorkspaceSelection {
  readonly graphNodeId: string | null;
  readonly treeNodeId: string | null;
}

interface TreeWorkspaceSelectionResult {
  readonly resolvedNode: ProjectTreeNode | null;
  readonly selection: WorkspaceSelection;
}
