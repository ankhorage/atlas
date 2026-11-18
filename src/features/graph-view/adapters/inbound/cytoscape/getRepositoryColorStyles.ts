import type { StylesheetJson } from 'cytoscape';

import { repositoryColor } from '@/constants/repositoryColor';

/*** Builds stable paint-only repository identity styles from prepared node presentation data. */
export function getRepositoryColorStyles() {
  return {
    compound: getRepositoryCompoundStyles(),
    leaf: getRepositoryLeafStyles(),
    selectedLeaf: getSelectedRepositoryLeafStyles(),
  };
}

/***
 * Paints first-party leaf nodes from their prepared immutable repository identity.
 *
 * Vendor nodes never receive a repository class. Repository identity remains visible during
 * selection while audit rules retain their stronger evidence border and outline signals.
 */
function getRepositoryLeafStyles(): StylesheetJson {
  return [
    {
      selector: 'node:childless.repositoryOwned',
      style: {
        'background-color': 'data(repositoryColor)',
        'border-color': repositoryColor.border,
        color: repositoryColor.text,
      },
    },
  ];
}

/*** Preserves the repository fill for selected leaf nodes without replacing selection evidence. */
function getSelectedRepositoryLeafStyles(): StylesheetJson {
  return [
    {
      selector: 'node:childless.repositoryOwned:selected',
      style: { 'background-color': 'data(repositoryColor)' },
    },
  ];
}

/***
 * Keeps repository identity visible for selected compounds while audit evidence retains priority.
 *
 * These declarations change paint only. Padding, border widths, labels, and geometry remain
 * owned by the existing compound styles so repository identity cannot trigger graph re-layout.
 */
function getRepositoryCompoundStyles(): StylesheetJson {
  return [
    {
      selector: 'node:parent.repositoryOwned',
      style: {
        'background-color': 'data(repositoryColor)',
        'border-color': repositoryColor.border,
        color: repositoryColor.text,
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
