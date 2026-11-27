import { isRecord } from '@ankhorage/utility/object';

import { isWorkspaceBranchName } from '@/features/workspace/application/use-cases/isWorkspaceBranchName';
import type {
  WorkspaceDefinition,
  WorkspacePresentationSettings,
  WorkspaceSource,
} from '@/types/workspace';
import { isRepositoryColors } from '@/utils/isRepositoryColors';
import { isRepositoryId } from '@/utils/isRepositoryId';

/*** Validate the browser-persisted workspace contract before it influences discovery or presentation. */
export function validateWorkspaceDefinitions(
  value: unknown
): readonly WorkspaceDefinition[] | null {
  if (!Array.isArray(value)) return null;
  const definitions = value.map(validateWorkspaceDefinition);
  if (definitions.some((definition): definition is null => definition === null)) return null;
  const valid = definitions.filter(
    (definition): definition is WorkspaceDefinition => definition !== null
  );
  return new Set(valid.map(definition => definition.id)).size === valid.length ? valid : null;
}

function validateWorkspaceDefinition(value: unknown): WorkspaceDefinition | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isWorkspaceId(value.id) ||
    !isWorkspaceName(value.name)
  ) {
    return null;
  }
  const sources = validateSources(value.sources);
  const settings = validateSettings(value.settings);
  const branchSelections = validateBranchSelections(value.branchSelections);
  return sources === null || settings === null || branchSelections === null
    ? null
    : {
        version: 1,
        id: value.id,
        name: value.name,
        sources,
        settings,
        ...(Object.keys(branchSelections).length === 0 ? {} : { branchSelections }),
      };
}

/** Preserve safe slash-containing branch names in existing portable workspace definitions. */
function validateBranchSelections(value: unknown): Readonly<Record<string, string>> | null {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > 256) return null;
  return Object.entries(value).every(
    ([repositoryId, branch]) => isRepositoryId(repositoryId) && isWorkspaceBranchName(branch)
  )
    ? Object.fromEntries(Object.entries(value) as readonly [string, string][])
    : null;
}

/*** Validate non-empty sources and reject ambiguous duplicate source identities. */
function validateSources(value: unknown): readonly WorkspaceSource[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sources = value.map(validateSource);
  if (sources.some((source): source is null => source === null)) return null;
  const valid = sources.filter((source): source is WorkspaceSource => source !== null);
  const identities = valid.map(source =>
    source.kind === 'github-owner'
      ? `owner:${source.owner.toLowerCase()}`
      : `repository:${source.repositoryId}`
  );
  return new Set(identities).size === identities.length ? valid : null;
}

/*** Validate one safe GitHub source without allowing credentials or local host paths. */
function validateSource(value: unknown): WorkspaceSource | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  if (value.kind === 'github-owner') {
    if (!isGitHubOwner(value.owner) || !Array.isArray(value.excludedRepositoryIds)) return null;
    const { excludedRepositoryIds } = value;
    return excludedRepositoryIds.every(isRepositoryId) &&
      new Set(excludedRepositoryIds).size === excludedRepositoryIds.length
      ? { kind: 'github-owner', owner: value.owner, excludedRepositoryIds }
      : null;
  }
  if (value.kind === 'github-repository') {
    return isRepositoryId(value.repositoryId) && isGitHubRepositoryUrl(value.url)
      ? { kind: 'github-repository', repositoryId: value.repositoryId, url: value.url }
      : null;
  }
  return null;
}

/*** Validate bounded, serializable graph presentation settings. */
function validateSettings(value: unknown): WorkspacePresentationSettings | null {
  if (!isRecord(value)) return null;
  const {
    dependencyPrefix,
    dependencyKinds,
    layout,
    showCompoundNodes,
    showVendorPackages,
    spacing,
    subPackageDepth,
    repositoryColors,
  } = value;
  if (
    typeof dependencyPrefix !== 'string' ||
    typeof showCompoundNodes !== 'boolean' ||
    typeof showVendorPackages !== 'boolean' ||
    typeof layout !== 'string' ||
    !isFiniteNumber(spacing) ||
    !isNonNegativeInteger(subPackageDepth) ||
    !Array.isArray(dependencyKinds) ||
    !(repositoryColors === undefined || isRepositoryColors(repositoryColors))
  )
    return null;
  const validKinds = new Set(['runtime', 'dev', 'peer', 'optional']);
  return dependencyKinds.every(kind => typeof kind === 'string' && validKinds.has(kind)) &&
    new Set(dependencyKinds).size === dependencyKinds.length
    ? {
        dependencyPrefix,
        dependencyKinds: dependencyKinds as WorkspacePresentationSettings['dependencyKinds'],
        showCompoundNodes,
        showVendorPackages,
        subPackageDepth,
        layout,
        spacing,
        repositoryColors: repositoryColors ?? {},
      }
    : null;
}

/*** Restrict browser-local workspace identities to stable safe tokens. */
function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value);
}

/*** Restrict visible workspace names to a compact non-blank label. */
function isWorkspaceName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
}

/*** Accept GitHub owner syntax while keeping it independent from any local path. */
function isGitHubOwner(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?$/u.test(value);
}

/*** Accept only canonical public GitHub repository URLs without credentials or query state. */
function isGitHubRepositoryUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      /^\/[\w.-]+\/[\w.-]+\/?$/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/*** Narrow a value to a finite JSON number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/*** Narrow a value to a non-negative finite integer used for graph depth. */
function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}
