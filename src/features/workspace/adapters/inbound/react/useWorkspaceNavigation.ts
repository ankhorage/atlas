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
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
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
  const selectableGraphNodeIdSet = useMemo(
    () => new Set(selectableGraphNodeIds),
    [selectableGraphNodeIds]
  );

  /*** Navigate graph scope and mirror its tree location without inventing a graph selection. */
  const navigateToPackage = (path: string) => {
    const packageName = normalizeGraphPackage(path);
    const matchingTreeNode = findProjectTreeNodeByGraphPackage(projectTree, packageName);
    setCurrentPackage(packageName);
    setSelection(
      matchingTreeNode === null ? null : { graphNodeId: null, treeNodeId: matchingTreeNode.id }
    );
  };

  /*** Resolve TreeView rows to one graph endpoint while preserving existing package navigation. */
  const selectProjectTreeNode = (node: ProjectTreeNode) => {
    const resolved = resolveProjectTreeSelection(node, selectableGraphNodeIds);
    if (resolved === null) {
      setSelection(previous =>
        keepStableSelection(previous, { graphNodeId: null, treeNodeId: node.id })
      );
      return;
    }

    const graphNodeId = normalizeGraphPackage(resolved.graphPackage);
    setSelection(previous =>
      keepStableSelection(previous, { graphNodeId, treeNodeId: resolved.id })
    );
    setCurrentPackage(resolveProjectTreeNavigation(resolved, packageIds, currentPackage));
  };

  /*** Resolve GraphView selection through the same descendant policy and reveal its tree row. */
  const selectGraphNode = (id: string) => {
    const graphNodeId = normalizeGraphPackage(id);
    const treeNode = resolveGraphProjectTreeSelection(
      projectTree,
      graphNodeId,
      selectableGraphNodeIds
    );
    const resolvedGraphNodeId =
      treeNode === null
        ? selectableGraphNodeIdSet.has(graphNodeId)
          ? graphNodeId
          : null
        : normalizeGraphPackage(treeNode.graphPackage);
    if (resolvedGraphNodeId === null) return;

    setSelection(previous =>
      keepStableSelection(previous, {
        graphNodeId: resolvedGraphNodeId,
        treeNodeId: treeNode?.id ?? null,
      })
    );
  };

  /*** Clear only the logical selection that owns this unselect event, ignoring stale callbacks. */
  const unselectGraphNode = (id: string) => {
    const graphNodeId = normalizeGraphPackage(id);
    setSelection(previous => (previous?.graphNodeId === graphNodeId ? null : previous));
  };

  return {
    currentPackage,
    navigateToPackage,
    packageGraph,
    projectTree,
    selectedGraphNodeId: selection?.graphNodeId ?? null,
    selectedTreeId: selection?.treeNodeId ?? null,
    selectGraphNode,
    selectProjectTreeNode,
    unselectGraphNode,
  };
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

interface WorkspaceSelection {
  readonly graphNodeId: string | null;
  readonly treeNodeId: string | null;
}
