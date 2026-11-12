import { describe, expect, it, render } from '@artiphishle/testosterone';
import { ZoraProvider } from '@ankhorage/zora/web/runtime';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { CyclicDependenciesRuleDetails } from '@/features/audit/adapters/inbound/react/CyclicDependenciesRuleDetails';
import { getCycleId } from '@/features/audit/utils/cycleVisualization';
import type { CycleInspection } from '@/types/auditVisualization';

const cycle = { packages: ['a', 'b', 'a'], edges: [] };

function Harness() {
  const [inspection, setInspection] = useState<CycleInspection | null>(null);
  const [selected, setSelected] = useState(true);
  return (
    <>
      <CyclicDependenciesRuleDetails
        cycles={[cycle]}
        inspectedCycleId={inspection?.id ?? null}
        cycleSelection={{
          highlights: [],
          selectedIds: selected ? [getCycleId(cycle)] : [],
          setSelected: (_, value) => setSelected(value),
        }}
        onCycleInspectionChange={setInspection}
      />
      <output data-testid="inspection-state">{inspection?.label ?? 'closed'}</output>
      <output data-testid="selection-state">{selected ? 'selected' : 'unselected'}</output>
    </>
  );
}

describe('[cycle interaction]', () => {
  it('keeps row inspection independent from the trailing cycle switch', async () => {
    const host = render(<div />);
    const previousForm = Object.getOwnPropertyDescriptor(globalThis, 'HTMLFormElement');
    Object.defineProperty(globalThis, 'HTMLFormElement', {
      configurable: true,
      value: window.HTMLFormElement,
    });
    const root = createRoot(host.container);
    try {
      await act(async () =>
        root.render(
          <ZoraProvider mode="light">
            <Harness />
          </ZoraProvider>
        )
      );
      const row = host.container.querySelector<HTMLElement>('[data-testid="cycle-row-0"]')!;
      const toggle = host.container.querySelector<HTMLElement>('[data-testid="cycle-switch-0"]')!;

      const inspectionState = () =>
        host.container.querySelector<HTMLElement>('[data-testid="inspection-state"]')?.textContent;
      const selectionState = () =>
        host.container.querySelector<HTMLElement>('[data-testid="selection-state"]')?.textContent;

      expect(row.textContent).toContain('C1: a → b → a');
      expect(selectionState()).toBe('selected');
      expect(inspectionState()).toBe('closed');

      await act(async () => toggle.click());
      expect(selectionState()).toBe('unselected');
      expect(inspectionState()).toBe('closed');

      await act(async () => toggle.click());
      expect(selectionState()).toBe('selected');
      expect(inspectionState()).toBe('closed');

      await act(async () => row.click());
      expect(inspectionState()).toBe('Cycle 1');

      await act(async () => toggle.click());
      expect(selectionState()).toBe('unselected');
      expect(inspectionState()).toBe('closed');
    } finally {
      await act(async () => root.unmount());
      host.unmount();
      if (previousForm) Object.defineProperty(globalThis, 'HTMLFormElement', previousForm);
      else Reflect.deleteProperty(globalThis, 'HTMLFormElement');
    }
  });
});
