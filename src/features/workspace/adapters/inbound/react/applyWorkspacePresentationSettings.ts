import type { useSettings } from '@/features/settings/adapters/inbound/react/useSettings';
import type { DependencyFilterKind } from '@/types/settings';
import type { WorkspacePresentationSettings } from '@/types/workspace';

/*** Restore saved graph presentation without changing the current repository analysis. */
export function applyWorkspacePresentationSettings(
  settings: ReturnType<typeof useSettings>,
  workspace: WorkspacePresentationSettings
): void {
  for (const repositoryId of Object.keys(settings.repositoryColors))
    if (!(repositoryId in workspace.repositoryColors)) settings.setRepositoryColor(repositoryId, undefined);
  for (const [repositoryId, color] of Object.entries(workspace.repositoryColors))
    settings.setRepositoryColor(repositoryId, color);
  settings.setDependencyPackagePrefix(workspace.dependencyPrefix);
  setWorkspaceLayout(settings, workspace.layout);
  settings.setCytoscapeLayoutSpacing(workspace.spacing);
  settings.setSubPackageDepth(workspace.subPackageDepth);
  if (settings.showCompoundNodes !== workspace.showCompoundNodes)
    settings.toggleShowCompoundNodes();
  if (settings.showVendorPackages !== workspace.showVendorPackages)
    settings.toggleShowVendorPackages();
  const enabled = new Set(workspace.dependencyKinds.map(fromWorkspaceDependencyKind));
  for (const kind of [
    'dependency',
    'devDependency',
    'peerDependency',
    'optionalDependency',
  ] as const)
    if (settings.enabledDependencyKinds.has(kind) !== enabled.has(kind))
      settings.toggleDependencyKind(kind);
}

/*** Capture current graph presentation without including analysis data in a workspace definition. */
export function readWorkspacePresentationSettings(
  settings: ReturnType<typeof useSettings>
): WorkspacePresentationSettings {
  return {
    dependencyPrefix: settings.dependencyPackagePrefix,
    dependencyKinds: [...settings.enabledDependencyKinds].map(toWorkspaceDependencyKind),
    layout: settings.cytoscapeLayout,
    repositoryColors: settings.repositoryColors,
    showCompoundNodes: settings.showCompoundNodes,
    showVendorPackages: settings.showVendorPackages,
    spacing: settings.cytoscapeLayoutSpacing,
    subPackageDepth: settings.subPackageDepth,
  };
}

/*** Apply only layouts supported by the current GraphView runtime. */
function setWorkspaceLayout(settings: ReturnType<typeof useSettings>, layout: string): void {
  if (
    layout === 'breadthfirst' ||
    layout === 'circle' ||
    layout === 'concentric' ||
    layout === 'elk' ||
    layout === 'grid'
  )
    settings.setCytoscapeLayout(layout);
}

/*** Encode one settings dependency kind into the portable workspace contract. */
function toWorkspaceDependencyKind(
  kind: DependencyFilterKind
): WorkspacePresentationSettings['dependencyKinds'][number] {
  return kind === 'dependency'
    ? 'runtime'
    : kind === 'devDependency'
      ? 'dev'
      : kind === 'peerDependency'
        ? 'peer'
        : 'optional';
}

/*** Decode one portable dependency kind into the settings adapter vocabulary. */
function fromWorkspaceDependencyKind(
  kind: WorkspacePresentationSettings['dependencyKinds'][number]
): DependencyFilterKind {
  return kind === 'runtime'
    ? 'dependency'
    : kind === 'dev'
      ? 'devDependency'
      : kind === 'peer'
        ? 'peerDependency'
        : 'optionalDependency';
}
