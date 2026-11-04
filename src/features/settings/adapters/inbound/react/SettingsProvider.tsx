import { useLocalStorage } from 'ankh-hooks/store';
import { createElement, type PropsWithChildren, useMemo } from 'react';

import { SettingsContext } from '@/features/settings/adapters/inbound/react/SettingsContext';
import { readSettingsEnvironment } from '@/features/settings/utils/readSettingsEnvironment';
import type { DependencyFilterKind } from '@/types/settings';

/*** Provides persisted graph settings to the application. */
export function SettingsProvider({ children, workspaceScope = 'default' }: SettingsProviderProps) {
  const environment = readSettingsEnvironment();
  const dependencyFilters = useDependencyFilterSettings(workspaceScope);
  const [maxSubPackageDepth, setMaxSubPackageDepth] = useMaxSubPackageDepthSetting();
  const [showCompoundNodes, setShowCompoundNodes] = useLocalStorage<boolean>(
    'showCompoundNodes',
    environment.showCompoundNodes
  );
  const [showVendorPackages, setShowVendorPackages] = useLocalStorage<boolean>(
    'showVendorPackages',
    environment.showVendorPackages
  );
  const [subPackageDepth, setSubPackageDepth] = useLocalStorage<number>(
    'subPackageDepth',
    environment.subPackageDepth
  );
  const [cytoscapeLayout, setCytoscapeLayout] = useLocalStorage(
    'cytoscapeLayout',
    environment.cytoscapeLayout
  );
  const [cytoscapeLayoutSpacing, setCytoscapeLayoutSpacing] = useLocalStorage<number>(
    'cytoscapeLayoutSpacing',
    environment.cytoscapeLayoutSpacing
  );

  return createElement(
    SettingsContext.Provider,
    {
      value: {
        cytoscapeLayout,
        cytoscapeLayoutSpacing,
        maxSubPackageDepth,
        showCompoundNodes,
        showVendorPackages,
        ...dependencyFilters,
        subPackageDepth,
        setCytoscapeLayout,
        setCytoscapeLayoutSpacing,
        setMaxSubPackageDepth,
        setSubPackageDepth,
        toggleShowCompoundNodes: () => setShowCompoundNodes(previous => !previous),
        toggleShowVendorPackages: () => setShowVendorPackages(previous => !previous),
      },
    },
    children
  );
}

/*** Owns persisted dependency-visibility preferences for one portable workspace scope. */
function useDependencyFilterSettings(workspaceScope: string) {
  const [dependencyPackagePrefix, setDependencyPackagePrefix] = useLocalStorage<string>(
    dependencySettingsKey(workspaceScope, 'packagePrefix'),
    ''
  );
  const [enabledDependencyKinds, setEnabledDependencyKinds] = useLocalStorage<
    readonly DependencyFilterKind[]
  >(dependencySettingsKey(workspaceScope, 'enabledKinds'), ALL_DEPENDENCY_KINDS);
  const dependencyKinds = useMemo(() => new Set(enabledDependencyKinds), [enabledDependencyKinds]);

  return {
    dependencyPackagePrefix,
    enabledDependencyKinds: dependencyKinds,
    setDependencyPackagePrefix,
    toggleDependencyKind: (kind: DependencyFilterKind) =>
      setEnabledDependencyKinds(previous =>
        previous.includes(kind)
          ? previous.filter(candidate => candidate !== kind)
          : [...previous, kind]
      ),
  };
}

/*** Owns the persisted maximum package-depth state. */
function useMaxSubPackageDepthSetting() {
  return useLocalStorage<number>('maxSubPackageDepth', 1);
}

/*** Keeps dependency filter choices isolated to the active portable workspace identity. */
function dependencySettingsKey(workspaceScope: string, setting: string): string {
  return `atlas.workspace.${encodeURIComponent(workspaceScope)}.dependency.${setting}`;
}

interface SettingsProviderProps extends PropsWithChildren {
  readonly workspaceScope?: string;
}

const ALL_DEPENDENCY_KINDS: readonly DependencyFilterKind[] = [
  'dependency',
  'devDependency',
  'peerDependency',
  'optionalDependency',
];
