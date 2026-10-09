import type { Capability } from '@ankhorage/contracts/capability';

/*** Publish the canonical catalog for Atlas CLI capabilities. */
export const CAPABILITIES = [
  {
    id: 'atlas.audit',
    owner: '@ankhorage/atlas',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Audit project architecture',
    description: 'Create an Atlas audit from a local path or GitHub repository.',
  },
  {
    id: 'atlas.inspect',
    owner: '@ankhorage/atlas',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Inspect project dependencies',
    description: 'Open the Atlas graph inspector for a local path or GitHub repository.',
  },
  {
    id: 'atlas.export',
    owner: '@ankhorage/atlas',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Export Atlas report',
    description: 'Export a portable Atlas report artifact.',
  },
] as const satisfies readonly Capability[];
