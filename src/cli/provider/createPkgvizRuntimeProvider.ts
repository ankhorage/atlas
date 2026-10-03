import { audit } from '@/cli/commands/audit';
import { runExportCommand } from '@/cli/commands/export/runExportCommand';
import { view } from '@/cli/commands/view';

import packageJson from '../../../package.json';

/*** Create the Ankh runtime provider for PKGViz audit, viewer, and offline-export commands. */
export function createPkgvizRuntimeProvider() {
  return {
    id: 'pkgviz',
    category: 'pkgviz',
    version: packageJson.version,
    capabilities: ['pkgviz.audit', 'pkgviz.view', 'pkgviz.export'],
    commands: [
      {
        path: ['audit'],
        capability: 'pkgviz.audit',
        summary: 'Create a PKGViz audit from a local path or GitHub repository URL.',
      },
      {
        path: ['view'],
        capability: 'pkgviz.view',
        summary: 'Open the PKGViz graph viewer for a local path or GitHub repository URL.',
      },
      {
        path: ['export'],
        capability: 'pkgviz.export',
        summary: 'Export a portable PKGViz report artifact.',
      },
    ],
    handlers: [
      { path: ['audit'], handler: audit },
      { path: ['view'], handler: view },
      { path: ['export'], handler: runExportCommand },
    ],
  } as const;
}
