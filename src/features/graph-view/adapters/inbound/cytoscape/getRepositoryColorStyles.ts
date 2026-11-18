import type { StylesheetJson } from 'cytoscape';

const DEFAULT_REPOSITORY_COLOR = '#DCEAFB';
const DEFAULT_REPOSITORY_BORDER = '#496477';
const DEFAULT_REPOSITORY_TEXT = '#102033';

/*** Builds paint-only repository identity styles from the active ZORA semantic palette. */
export function getRepositoryColorStyles() {
  return {
    compound: getRepositoryCompoundStyles(),
    leaf: getRepositoryLeafStyles(),
  };
}

/***
 * Paints first-party leaf nodes from their prepared immutable repository identity.
 *
 * Vendor nodes never receive a repository class. Hover, selected, and audit rules are emitted
 * later, so transient interaction and audit evidence remain the stronger signals.
 */
function getRepositoryLeafStyles(): StylesheetJson {
  return [
    {
      selector: 'node:childless.repositoryOwned',
      style: {
        'background-color': DEFAULT_REPOSITORY_COLOR,
        'border-color': DEFAULT_REPOSITORY_BORDER,
        color: DEFAULT_REPOSITORY_TEXT,
      },
    },
  ];
}

/***
 * Preserves selected and audit compound priority while retaining repository identity at rest.
 *
 * These declarations change paint only. Padding, border widths, labels, and geometry remain
 * owned by the existing compound styles so repository identity cannot trigger graph re-layout.
 */
function getRepositoryCompoundStyles(): StylesheetJson {
  return [
    {
      selector: 'node:parent.repositoryOwned',
      style: {
        'background-color': DEFAULT_REPOSITORY_COLOR,
        'border-color': DEFAULT_REPOSITORY_BORDER,
        color: DEFAULT_REPOSITORY_TEXT,
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
