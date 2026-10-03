import { describe, expect, it, render } from '@artiphishle/testosterone';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { useCycleSelection } from '@/features/audit/adapters/inbound/react/useCycleSelection';
import { getCycleId } from '@/features/audit/utils/cycleVisualization';

const cycles = [{ packages: ['a', 'b', 'a'], edges: [] }];

function Harness({ controls }: { controls: boolean }) {
  const selection = useCycleSelection(cycles);
  return (
    <>
      <output>{selection.highlights.length}</output>
      {controls ? (
        <button onClick={() => selection.setSelected(getCycleId(cycles[0]), false)}>Disable</button>
      ) : null}
    </>
  );
}

describe('[cycle selection lifetime]', () => {
  it('keeps an explicit disabled choice across tab content changes and remounts despite an enabled ENV default', async () => {
    const previousProject = process.env.NEXT_PUBLIC_PROJECT_PATH;
    const previousDefault = process.env.NEXT_PUBLIC_SETTINGS_SHOW_CYCLES;
    process.env.NEXT_PUBLIC_PROJECT_PATH = 'cycle-selection-unit-test';
    process.env.NEXT_PUBLIC_SETTINGS_SHOW_CYCLES = 'true';
    const host = render(<div />);
    const key = 'atlas:cycles:v1:cycle-selection-unit-test';
    // Testosterone's render helper creates an opaque-origin DOM. Supply an isolated storage port.
    const previousStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: name => values.get(name) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: name => {
        values.delete(name);
      },
      setItem: (name, value) => {
        values.set(name, value);
      },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    const root = createRoot(host.container);
    try {
      await act(async () => root.render(<Harness controls />));
      expect(host.container.querySelector('output')?.textContent).toBe('1');
      await act(async () => host.container.querySelector('button')?.click());
      expect(host.container.querySelector('output')?.textContent).toBe('0');
      await act(async () => root.render(<Harness controls={false} />));
      await act(async () => root.render(<Harness controls />));
      expect(host.container.querySelector('output')?.textContent).toBe('0');
      expect(storage.getItem(key) !== null).toBe(true);
      await act(async () => root.render(null));
      await act(async () => root.render(<Harness controls />));
      expect(host.container.querySelector('output')?.textContent).toBe('0');
    } finally {
      await act(async () => root.unmount());
      if (previousStorage) Object.defineProperty(window, 'localStorage', previousStorage);
      else Reflect.deleteProperty(window, 'localStorage');
      if (previousProject === undefined) delete process.env.NEXT_PUBLIC_PROJECT_PATH;
      else process.env.NEXT_PUBLIC_PROJECT_PATH = previousProject;
      if (previousDefault === undefined) delete process.env.NEXT_PUBLIC_SETTINGS_SHOW_CYCLES;
      else process.env.NEXT_PUBLIC_SETTINGS_SHOW_CYCLES = previousDefault;
      host.unmount();
    }
  });
});
