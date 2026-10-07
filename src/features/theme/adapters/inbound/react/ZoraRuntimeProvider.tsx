'use client';

import type { ThemeConfig } from '@ankhorage/contracts';
import { ZoraProvider } from '@zora/ZoraProvider';

/*** Installs the single ZORA theme runtime for the Atlas application. */
export function ZoraRuntimeProvider({ children, initialMode, themeConfig }: ZoraRuntimeProps) {
  return (
    <ZoraProvider initialMode={initialMode} themeConfig={{ ...themeConfig }}>
      {children}
    </ZoraProvider>
  );
}

interface ZoraRuntimeProps {
  readonly children: React.ReactNode;
  readonly initialMode: 'dark' | 'light';
  readonly themeConfig: ThemeConfig;
}
