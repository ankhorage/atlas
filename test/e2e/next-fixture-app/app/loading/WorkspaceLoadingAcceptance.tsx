'use client';

import { ZoraProvider } from '@ankhorage/zora/web/runtime';
import React, { useEffect } from 'react';

import appManifest from '@/../ankh.config.json';
import { WorkspaceGraph } from '@/features/workspace/adapters/inbound/react/WorkspaceGraph';

/*** Renders Atlas's real workspace loading branch in a bounded graph region for browser acceptance. */
export function WorkspaceLoadingAcceptance({ mode }: WorkspaceLoadingAcceptanceProps) {
  const themeConfig = appManifest.themes.atlas;
  useEffect(() => {
    document.documentElement.dataset.workspaceLoadingHydrated = 'true';
  }, []);
  return (
    <ZoraProvider initialMode={mode} themeConfig={{ ...themeConfig }}>
      <main data-testid="workspace-loading-region" style={regionStyle}>
        <WorkspaceGraph
          currentPackage=""
          cycleEvidenceHidden={false}
          cycleHighlights={[]}
          cycleInspection={null}
          packageGraph={null}
          revealedCycleId={null}
          selectedGraphNodeIds={[]}
          setCurrentPackage={() => undefined}
          onCloseInspection={() => undefined}
          onCycleEvidenceVisibilityChange={() => undefined}
          onGraphNodeSelect={() => undefined}
          onRevealCycle={() => undefined}
        />
      </main>
    </ZoraProvider>
  );
}

const regionStyle = {
  display: 'flex',
  height: 'calc(100vh - 96px)',
  margin: 48,
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  width: 'calc(100vw - 96px)',
};

interface WorkspaceLoadingAcceptanceProps {
  readonly mode: 'dark' | 'light';
}
