import '@/app/globals.css';

import type { Metadata } from 'next';

import { ZoraRuntimeProvider } from '@/features/theme/adapters/inbound/react/ZoraRuntimeProvider';

export const metadata: Metadata = {
  title: 'Atlas',
  description: 'Codebase dependency and architecture analysis',
};

/*** Renders the application root layout under the single ZORA theme runtime. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ZoraRuntimeProvider>{children}</ZoraRuntimeProvider>
      </body>
    </html>
  );
}
