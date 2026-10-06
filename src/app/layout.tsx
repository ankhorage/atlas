import '@/app/globals.css';

import { parseAppManifest } from '@ankhorage/contracts';
import type { Metadata } from 'next';

import { ZoraRuntimeProvider } from '@/features/theme/adapters/inbound/react/ZoraRuntimeProvider';

import appManifest from '../../ankh.config.json';

export const metadata: Metadata = {
  title: appManifest.metadata.name,
  description: 'Codebase dependency and architecture analysis',
};

/*** Renders the application root layout under the single ZORA theme runtime. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const parsed = parseAppManifest(appManifest);
  if (!parsed.ok) throw new Error(parsed.message);
  const { manifest } = parsed;

  return (
    <html lang="en">
      <body>
        <ZoraRuntimeProvider
          initialMode={manifest.activeThemeMode ?? 'light'}
          themeConfig={manifest.themes[manifest.activeThemeId]}
        >
          {children}
        </ZoraRuntimeProvider>
      </body>
    </html>
  );
}
