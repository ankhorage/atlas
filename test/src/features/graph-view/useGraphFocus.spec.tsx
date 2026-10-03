import { describe, expect, it, render } from '@artiphishle/testosterone';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { useGraphFocus } from '@/features/graph-view/adapters/inbound/react/useGraphFocus';
import { useGraphProjection } from '@/features/graph-view/adapters/inbound/react/useGraphProjection';
import type { CycleHighlight } from '@/types/auditVisualization';

describe('[cycle projection workflow]', () => {
  it('settles ancestor/descendant cycles without fighting automatic package navigation', async () => {
    const ancestor = 'io.reflectoring.coderadar';
    const descendant = ancestor + '.analyzer.service';
    const elements = {
      nodes: [ancestor, ancestor + '.analyzer', descendant, ancestor + '.query'].map(id => ({
        data: { id },
      })),
      edges: [{ data: { source: ancestor, target: descendant, weight: 1 } }],
    };
    const active: readonly CycleHighlight[] = [
      {
        id: 'ancestor-cycle',
        color: 'red',
        cycle: { packages: [ancestor, descendant, ancestor], edges: [] },
      },
    ];
    const transitions: string[] = [];
    const host = render(<div />);
    const root = createRoot(host.container);

    function Harness({ highlights }: { highlights: readonly CycleHighlight[] }) {
      const [currentPackage, setCurrentPackage] = useState(ancestor);
      const [subPackageDepth, setSubPackageDepth] = useState(1);
      const [, setMaxSubPackageDepth] = useState(1);
      const navigate = (scope: string) => {
        transitions.push(scope);
        if (transitions.length > 10) throw new Error('Projection did not settle');
        setCurrentPackage(scope);
      };
      const visibleElements = useGraphProjection({
        currentPackage,
        elements,
        subPackageDepth,
        preservePackageScope: highlights.length > 0,
        setCurrentPackage: navigate,
        setMaxSubPackageDepth,
        setSubPackageDepth,
        showCompoundNodes: false,
        showVendorPackages: true,
      });
      useGraphFocus({
        currentPackage,
        cycleHighlights: highlights,
        setCurrentPackage: navigate,
        setSubPackageDepth,
        subPackageDepth,
        visibleElements,
      });
      return (
        <output data-scope={currentPackage}>
          {visibleElements?.nodes.map(node => node.data.id).join('|')}
        </output>
      );
    }

    try {
      await act(async () => root.render(<Harness highlights={[]} />));
      await act(async () => root.render(<Harness highlights={active} />));
      expect(host.container.querySelector('output')?.getAttribute('data-scope')).toBe(
        'io.reflectoring'
      );
      expect(host.container.querySelector('output')?.textContent?.split('|')).toContain(ancestor);
      expect(host.container.querySelector('output')?.textContent?.split('|')).toContain(descendant);
      expect(transitions).toEqual(['io.reflectoring']);

      await act(async () => root.render(<Harness highlights={active} />));
      await act(async () => root.render(<Harness highlights={[]} />));
      await act(async () => root.render(<Harness highlights={active} />));
      expect(transitions).toEqual(['io.reflectoring']);
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });

  it('preserves scope and depth when every active cycle package is already visible', async () => {
    const transitions: string[] = [];
    const depthChanges: number[] = [];
    const host = render(<div />);
    const root = createRoot(host.container);
    const elements = {
      nodes: ['app.a', 'app.b'].map(id => ({ data: { id } })),
      edges: [{ data: { source: 'app.a', target: 'app.b', weight: 1 } }],
    };
    const active: readonly CycleHighlight[] = [
      {
        id: 'visible-cycle',
        color: 'red',
        cycle: { packages: ['app.a', 'app.b', 'app.a'], edges: [] },
      },
    ];

    function Harness() {
      const [currentPackage, setCurrentPackage] = useState('app');
      const [subPackageDepth, setSubPackageDepth] = useState(1);
      const [, setMaxSubPackageDepth] = useState(1);
      const navigate = (scope: string) => {
        transitions.push(scope);
        setCurrentPackage(scope);
      };
      const setDepth = (depth: number) => {
        depthChanges.push(depth);
        setSubPackageDepth(depth);
      };
      const visibleElements = useGraphProjection({
        currentPackage,
        elements,
        subPackageDepth,
        preservePackageScope: true,
        setCurrentPackage: navigate,
        setMaxSubPackageDepth,
        setSubPackageDepth: setDepth,
        showCompoundNodes: false,
        showVendorPackages: true,
      });
      useGraphFocus({
        currentPackage,
        cycleHighlights: active,
        setCurrentPackage: navigate,
        setSubPackageDepth: setDepth,
        subPackageDepth,
        visibleElements,
      });
      return <output>{visibleElements?.nodes.map(node => node.data.id).join('|')}</output>;
    }

    try {
      await act(async () => root.render(<Harness />));
      expect(host.container.querySelector('output')?.textContent?.split('|')).toEqual([
        'app.a',
        'app.b',
      ]);
      expect(transitions).toEqual([]);
      expect(depthChanges).toEqual([]);
    } finally {
      await act(async () => root.unmount());
      host.unmount();
    }
  });
});
