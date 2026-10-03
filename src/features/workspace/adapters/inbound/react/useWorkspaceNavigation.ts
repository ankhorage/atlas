'use client';

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

/*** Own selection transitions without coupling them to package-scope navigation. */
function useWorkspaceSelection(input: WorkspaceSelectionInput) {
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const graphNodeIdSet = useMemo(() => new Set(input.packageIds), [input.packageIds]);

  const selectProjectTreeNode = (node: ProjectTreeNode) => {
    const next = resolveTreeWorkspaceSelection(node, input.packageIds);
    setSelection(previous => keepStableSelection(previous, next));
  };

  const selectGraphNode = (id: string) => {
    const next = resolveGraphWorkspaceSelection(id, input, graphNodeIdSet);
    if (next !== null) setSelection(previous => keepStableSelection(previous, next));
  };

  const unselectGraphNode = (id: string) => {
    const graphNodeId = normalizeGraphPackage(id);
    setSelection(previous => (previous?.graphNodeId === graphNodeId ? null : previous));
  };

  return {
    selectedGraphNodeId: selection?.graphNodeId ?? null,
    selectedTreeId: selection?.treeNodeId ?? null,
    selectGraphNode,
    selectProjectTreeNode,
    unselectGraphNode,
  };
}

/*** Resolve one TreeView click to that exact row and its directly represented graph identity. */
function resolveTreeWorkspaceSelection(
  node: ProjectTreeNode,
  graphNodeIds: readonly string[]
): WorkspaceSelection {
  return {
    graphNodeId: resolveProjectTreeGraphNodeId(node, graphNodeIds),
    treeNodeId: node.id,
  };
}

/*** Resolve one GraphView click to the same graph node and its exact matching TreeView row. */
function resolveGraphWorkspaceSelection(
  id: string,
  input: WorkspaceSelectionInput,
  graphNodeIdSet: ReadonlySet<string>
): WorkspaceSelection | null {
  const graphNodeId = normalizeGraphPackage(id);
  if (!graphNodeIdSet.has(graphNodeId)) return null;
  const treeNode = resolveGraphProjectTreeSelection(input.projectTree, graphNodeId, input.packageIds);
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
  readonly packageIds: readonly string[];
  readonly projectTree: readonly ProjectTreeNode[];
}

interface WorkspaceSelection {
  readonly graphNodeId: string | null;
  readonly treeNodeId: string | null;
}
