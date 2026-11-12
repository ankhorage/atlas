import { describe, expect, it, render } from '@artiphishle/testosterone';
import { ZoraProvider } from '@ankhorage/zora/web/runtime';
import React from 'react';

import { CycleInspector } from '@/features/audit/adapters/inbound/react/CycleInspector';

describe('[CycleInspector]', () => {
  it('renders dependency evidence through ZORA accordion items instead of raw details elements', () => {
    const { container, getByText, unmount } = render(
      <ZoraProvider mode="light">
        <CycleInspector
          inspection={{
            id: 'cycle-1',
            color: '#ff0000',
            label: 'Cycle 1',
            cycle: {
              packages: ['app.a', 'app.b', 'app.a'],
              edges: [
                {
                  from: 'app.a',
                  to: 'app.b',
                  via: [
                    {
                      filePath: 'src/a.ts',
                      fileClass: 'A',
                      importName: 'app.b.B',
                      isIntrinsic: true,
                    },
                  ],
                },
              ],
            },
          }}
          onClose={() => undefined}
        />
      </ZoraProvider>
    );

    expect(getByText('Cycle 1')).toBeDefined();
    expect(getByText('1. app.a → app.b')).toBeDefined();
    expect(container.querySelector('details')).toBeNull();
    expect(container.textContent?.includes('src/a.ts')).toBe(false);
    unmount();
  });
});
