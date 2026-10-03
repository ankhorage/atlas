import { audit } from '@/cli/commands/audit';
import { runExportCommand } from '@/cli/commands/export/runExportCommand';
import { inspect } from '@/cli/commands/inspect';

import packageJson from '../../../package.json';

/*** Create the Ankh runtime provider for Atlas audit, inspect, and offline-export commands. */
export function createAtlasRuntimeProvider() {
  return {
    id: 'atlas',
    category: 'atlas',
    version: packageJson.version,
    capabilities: ['atlas.audit', 'atlas.inspect', 'atlas.export'],
    commands: [
      {
        path: ['audit'],
        capability: 'atlas.audit',
        summary: 'Create an Atlas audit from a local path or GitHub repository.',
      },
      {
        path: ['inspect'],
        capability: 'atlas.inspect',
        summary: 'Open the Atlas graph inspector for a local path or GitHub repository.',
      },
      {
        path: ['export'],
        capability: 'atlas.export',
        summary: 'Export a portable Atlas report artifact.',
      },
    ],
    handlers: [
      { path: ['audit'], handler: audit },
      { path: ['inspect'], handler: inspect },
      { path: ['export'], handler: runExportCommand },
    ],
  } as const;
}
