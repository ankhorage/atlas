import type { StylesheetJson } from 'cytoscape';

import type { GraphPalette } from '@/features/graph-view/adapters/inbound/cytoscape/getGraphPalette';

const DEFAULT_REPOSITORY_COLOR = '#DCEAFB';

/*** Builds paint-only repository identity styles from the active ZORA semantic palette. */
export function getRepositoryColorStyles(colors: GraphPalette) {
  return {
    compound: getRepositoryCompoundStyles(colors),
    leaf: getRepositoryLeafStyles(colors),
  };
}

/***
 * Paints first-party leaf nodes from their prepared immutable repository identity.
 *
 * Vendor nodes never receive a repository class. Hover, selected, and audit rules are emitted
 * later, so transient interaction and audit evidence remain the stronger signals.
 */
function getRepositoryLeafStyles(colors: GraphPalette): StylesheetJson {
  return [{
    selector: 'node:childless.repositoryOwned',
    style: {
      'background-color': DEFAULT_REPOSITORY_COLOR,
      'border-color': colors.nodeBorder,
      color: colors.nodeText,
    },
  }];
}

/***
 * Preserves selected and audit compound priority while retaining repository identity at rest.
 *
 * These declarations change paint only. Padding, border widths, labels, and geometry remain
 * owned by the existing compound styles so repository identity cannot trigger graph re-layout.
 */
function getRepositoryCompoundStyles(colors: GraphPalette): StylesheetJson {
  return [
    {
      selector: 'node:parent.repositoryOwned',
      style: {
        'background-color': DEFAULT_REPOSITORY_COLOR,
        'border-color': colors.nodeBorder,
        color: colors.nodeText,
      },
    },
    {
      selector: 'node:parent.repositoryOwned.auditCycle',
      style: {
        'underlay-opacity': 0,
        'border-color': 'data(auditCycleColor)',
        'border-opacity': 0.8,
        'outline-color': 'data(auditCycleColor)',
        'outline-width': 2,
        color: 'data(auditCycleColor)',
      },
    },
  ];
}
