'use client';
import type { SelectionIntent } from '@ankhorage/utility/selection';
import { Icon } from '@zora/icon';
import { type TreeItemNode, TreeView } from '@zora/tree-view';
import { View } from '@zora/view';
import React from 'react';

import { useProjectTreeExpansion } from '@/features/project-tree/adapters/inbound/react/useProjectTreeExpansion';
import { findProjectTreeNode } from '@/features/project-tree/utils/findProjectTreeNode';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Adapt Atlas's serializable project tree to the generated ZORA browser TreeView. */
export function ProjectTreePanel({
  nodes,
  onSelect,
  onToggleDirectory,
  selectedIds,
}: ProjectTreePanelProps) {
  const treeNodes = React.useMemo(() => nodes.map(node => toTreeItemNode(node)), [nodes]);
  const expansion = useProjectTreeExpansion(nodes, selectedIds);

  return (
    <View p="s">
      <TreeView
        ariaLabel="Project tree"
        expansionIndicator="folder"
        expandedIds={expansion.expandedIds}
        nodes={treeNodes}
        selectedIds={selectedIds}
        onExpandedChange={ids => {
          const changedId = getChangedExpansionId(expansion.expandedIds, ids);
          expansion.onExpandedChange(ids);
          if (changedId === null) return;
          const node = findProjectTreeNode(nodes, changedId);
          if (node?.kind === 'directory') onToggleDirectory(node, ids.includes(changedId));
        }}
        onSelect={(id, intent) => {
          const node = findProjectTreeNode(nodes, id);
          if (node) onSelect(node, intent);
        }}
      />
    </View>
  );
}

/*** Map a portable project-tree node into the ZORA TreeView presentation contract. */
function toTreeItemNode(node: ProjectTreeNode): TreeItemNode {
  return {
    id: node.id,
    label: node.label,
    icon: (
      <Icon
        name={node.kind === 'directory' ? 'folder-outline' : 'document-text-outline'}
        size={14}
      />
    ),
    ...(node.children ? { children: node.children.map(child => toTreeItemNode(child)) } : {}),
  };
}

/*** Identify the one folder id changed by an independent TreeView expansion control. */
function getChangedExpansionId(
  previousIds: readonly string[],
  nextIds: readonly string[]
): string | null {
  return (
    [...previousIds, ...nextIds].find(id => previousIds.includes(id) !== nextIds.includes(id)) ??
    null
  );
}

interface ProjectTreePanelProps {
  readonly nodes: readonly ProjectTreeNode[];
  readonly onSelect: (node: ProjectTreeNode, intent: SelectionIntent) => void;
  readonly onToggleDirectory: (node: ProjectTreeNode, expanded: boolean) => void;
  readonly selectedIds: readonly string[];
}
