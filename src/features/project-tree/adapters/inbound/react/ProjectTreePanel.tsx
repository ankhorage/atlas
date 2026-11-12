'use client';
import type { SelectionIntent } from '@ankhorage/utility/selection';
import { Icon } from '@ankhorage/zora/web/icon';
import { Text } from '@ankhorage/zora/web/text';
import { type TreeItemNode, TreeView } from '@ankhorage/zora/web/tree-view';
import { View } from '@ankhorage/zora/web/view';
import React from 'react';

import { useProjectTreeExpansion } from '@/features/project-tree/adapters/inbound/react/useProjectTreeExpansion';
import { findProjectTreeNode } from '@/features/project-tree/utils/findProjectTreeNode';
import type { ProjectTreeNode } from '@/types/projectTree';

/*** Adapt Atlas's serializable project tree to the generated ZORA browser TreeView. */
export function ProjectTreePanel({ nodes, onSelect, selectedIds }: ProjectTreePanelProps) {
  const treeNodes = React.useMemo(() => nodes.map(node => toTreeItemNode(node)), [nodes]);
  const expansion = useProjectTreeExpansion(nodes, selectedIds);

  return (
    <View p="xs">
      <TreeView
        ariaLabel="Project tree"
        expansionIndicator="chevron"
        expandedIds={expansion.expandedIds}
        nodes={treeNodes}
        selectedIds={selectedIds}
        onExpandedChange={expansion.onExpandedChange}
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
    label: (
      <Text numberOfLines={1} variant="bodySmall">
        {node.label}
      </Text>
    ),
    icon: (
      <Icon name={node.kind === 'file' ? 'document-text-outline' : 'folder-outline'} size="s" />
    ),
    ...(node.children ? { children: node.children.map(child => toTreeItemNode(child)) } : {}),
  };
}

interface ProjectTreePanelProps {
  readonly nodes: readonly ProjectTreeNode[];
  readonly onSelect: (node: ProjectTreeNode, intent: SelectionIntent) => void;
  readonly selectedIds: readonly string[];
}
