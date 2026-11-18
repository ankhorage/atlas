import type { StylesheetJson } from 'cytoscape';

const DEFAULT_REPOSITORY_COLOR = '#DCEAFB';
const DEFAULT_REPOSITORY_BORDER = '#496477';
const DEFAULT_REPOSITORY_TEXT = '#102033';

/*** Builds paint-only repository identity styles from persisted workspace overrides. */
export function getRepositoryColorStyles(repositoryColors: Readonly<Record<string, string>>) {
  return {
    compound: getRepositoryCompoundStyles(repositoryColors),
    leaf: getRepositoryLeafStyles(repositoryColors),
    selectedLeaf: getSelectedRepositoryLeafStyles(repositoryColors),
  };
}

/***
 * Paints first-party leaf nodes from their prepared immutable repository identity.
 *
 * Vendor nodes never receive a repository class. Repository identity remains visible during
 * selection while audit rules retain their stronger evidence border and outline signals.
 */
function getRepositoryLeafStyles(
  repositoryColors: Readonly<Record<string, string>>
): StylesheetJson {
  return [
    {
      selector: 'node:childless.repositoryOwned',
      style: {
        'background-color': DEFAULT_REPOSITORY_COLOR,
        'border-color': DEFAULT_REPOSITORY_BORDER,
        color: DEFAULT_REPOSITORY_TEXT,
      },
    },
    ...Object.entries(repositoryColors).map(([repositoryId, color]) => ({
      selector: `node:childless.repositoryOwned[repositoryId = ${JSON.stringify(repositoryId)}]`,
      style: { 'background-color': color },
    })),
  ];
}

/*** Preserves the repository fill for selected leaf nodes without replacing selection evidence. */
function getSelectedRepositoryLeafStyles(
  repositoryColors: Readonly<Record<string, string>>
): StylesheetJson {
  return [
    {
      selector: 'node:childless.repositoryOwned:selected',
      style: { 'background-color': DEFAULT_REPOSITORY_COLOR },
    },
    ...Object.entries(repositoryColors).map(([repositoryId, color]) => ({
      selector: `node:childless.repositoryOwned[repositoryId = ${JSON.stringify(repositoryId)}]:selected`,
      style: { 'background-color': color },
    })),
  ];
}

/***
 * Keeps repository identity visible for selected compounds while audit evidence retains priority.
 *
 * These declarations change paint only. Padding, border widths, labels, and geometry remain
 * owned by the existing compound styles so repository identity cannot trigger graph re-layout.
 */
function getRepositoryCompoundStyles(
  repositoryColors: Readonly<Record<string, string>>
): StylesheetJson {
  return [
    {
      selector: 'node:parent.repositoryOwned',
      style: {
        'background-color': DEFAULT_REPOSITORY_COLOR,
        'border-color': DEFAULT_REPOSITORY_BORDER,
        color: DEFAULT_REPOSITORY_TEXT,
      },
    },
    ...Object.entries(repositoryColors).map(([repositoryId, color]) => ({
      selector: `node:parent.repositoryOwned[repositoryId = ${JSON.stringify(repositoryId)}]`,
      style: { 'background-color': color },
    })),
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
