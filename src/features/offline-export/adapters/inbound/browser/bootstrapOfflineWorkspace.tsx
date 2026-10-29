import '@/app/globals.css';

import { parseAppManifest } from '@ankhorage/contracts';
import { createRoot } from 'react-dom/client';

import { ZoraRuntimeProvider } from '@/features/theme/adapters/inbound/react/ZoraRuntimeProvider';
import { WorkspaceView } from '@/features/workspace/adapters/inbound/react/WorkspaceView';
import { deserializeWorkspaceSnapshot } from '@/features/workspace/application/use-cases/deserializeWorkspaceSnapshot';
import { hydrateWorkspaceSnapshot } from '@/features/workspace/application/use-cases/hydrateWorkspaceSnapshot';

import appManifest from '../../../../../../ankh.config.json';

/*** Boots the shared Atlas workspace from the embedded, validated offline snapshot. */
function bootstrapOfflineWorkspace() {
  const rootElement = document.getElementById('atlas-offline-root');
  const snapshotElement = document.getElementById('atlas-workspace-snapshot');
  if (rootElement === null || snapshotElement === null) return;

  const root = createRoot(rootElement);
  try {
    const parsedManifest = parseAppManifest(appManifest);
    if (!parsedManifest.ok) throw new Error(parsedManifest.message);
    const initialMode = parsedManifest.manifest.activeThemeMode;
    if (initialMode === undefined) throw new Error('Atlas app manifest has no active theme mode.');
    const snapshot = deserializeWorkspaceSnapshot(snapshotElement.textContent);
    root.render(
      <ZoraRuntimeProvider
        initialMode={initialMode}
        themeConfig={parsedManifest.manifest.themes[parsedManifest.manifest.activeThemeId]}
      >
        <WorkspaceView
          offline
          projectName={snapshot.audit.meta.projectName}
          workspace={{ ok: true, value: hydrateWorkspaceSnapshot(snapshot) }}
        />
      </ZoraRuntimeProvider>
    );
  } catch (error) {
    root.render(
      <main role="alert">
        {error instanceof Error ? error.message : 'Unable to load Atlas workspace snapshot.'}
      </main>
    );
  }
}

bootstrapOfflineWorkspace();
