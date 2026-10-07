import { describe, expect, it, render } from '@artiphishle/testosterone';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { useProjectTreeExpansion } from '@/features/project-tree/adapters/inbound/react/useProjectTreeExpansion';
import type { ProjectTreeNode } from '@/types/projectTree';

const nodes: readonly ProjectTreeNode[] = [
  {
    id: 'root',
    label: 'root',
    graphPackage: 'root',
    kind: 'directory',
    children: [
      {
        id: 'nested',
        label: 'nested',
        graphPackage: 'root.nested',
        kind: 'directory',
        children: [{ id: 'file', label: 'file', kind: 'file', graphPackage: 'root.nested' }],
      },
    ],
  },
  {
    id: 'other',
    label: 'other',
    graphPackage: 'other',
    kind: 'directory',
    children: [
      {
        id: 'other-nested',
        label: 'other-nested',
        graphPackage: 'other.nested',
        kind: 'directory',
        children: [
          {
            id: 'other-file',
            label: 'other-file',
            kind: 'file',
            graphPackage: 'other.nested',
          },
        ],
      },
    ],
  },
];

function Harness({ selectedIds }: { selectedIds: readonly string[] }) {
  const expansion = useProjectTreeExpansion(nodes, selectedIds);
  return (
    <button onClick={() => expansion.onExpandedChange([])}>
      {expansion.expandedIds.join('|')}
    </button>
  );
}

describe('[project tree selection reveal]', () => {
  it('starts collapsed when no row is selected', async () => {
    const host = render(<div />);
    const root = createRoot(host.container);
    try {
      await act(async () => root.render(<Harness selectedIds={[]} />));
      expect(host.container.textContent).toBe('');
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });

  it('reveals ancestors for every selected row while preserving manual expansion ownership', async () => {
    const host = render(<div />);
    const root = createRoot(host.container);
    try {
      await act(async () => root.render(<Harness selectedIds={['file', 'other-file']} />));
      expect(host.container.textContent).toBe('root|nested|other|other-nested');

      await act(async () => host.container.querySelector('button')?.click());
      expect(host.container.textContent).toBe('');

      await act(async () => root.render(<Harness selectedIds={['file', 'other-file']} />));
      expect(host.container.textContent).toBe('');

      await act(async () => root.render(<Harness selectedIds={['file']} />));
      expect(host.container.textContent).toBe('root|nested');
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });
});
