import { readEnvBoolean, readEnvNumber, readEnvString } from '@ankhorage/utility/node/env';
import type { LayoutOptions } from 'cytoscape';

/*** Reads and validates Atlas viewer defaults from public settings environment variables. */
export function readSettingsEnvironment(): SettingsEnvironment {
  const environment = {
    NEXT_PUBLIC_SETTINGS_SHOW_CYCLES: process.env.NEXT_PUBLIC_SETTINGS_SHOW_CYCLES,
    NEXT_PUBLIC_SETTINGS_LAYOUT: process.env.NEXT_PUBLIC_SETTINGS_LAYOUT,
    NEXT_PUBLIC_SETTINGS_LAYOUT_SPACING: process.env.NEXT_PUBLIC_SETTINGS_LAYOUT_SPACING,
    NEXT_PUBLIC_SETTINGS_SHOW_COMPOUNDNODES: process.env.NEXT_PUBLIC_SETTINGS_SHOW_COMPOUNDNODES,
    NEXT_PUBLIC_SETTINGS_SHOW_VENDORPACKAGES: process.env.NEXT_PUBLIC_SETTINGS_SHOW_VENDORPACKAGES,
    NEXT_PUBLIC_SETTINGS_SUBPACKAGE_DEPTH: process.env.NEXT_PUBLIC_SETTINGS_SUBPACKAGE_DEPTH,
  };

  const layout = readEnvString('NEXT_PUBLIC_SETTINGS_LAYOUT', environment);
  const layoutSpacing = readEnvNumber('NEXT_PUBLIC_SETTINGS_LAYOUT_SPACING', environment);
  const subPackageDepth = readEnvNumber('NEXT_PUBLIC_SETTINGS_SUBPACKAGE_DEPTH', environment);

  return {
    showCycles: readEnvBoolean('NEXT_PUBLIC_SETTINGS_SHOW_CYCLES', environment) ?? false,
    cytoscapeLayout: isSupportedLayout(layout) ? layout : 'concentric',
    cytoscapeLayoutSpacing:
      layoutSpacing !== undefined && layoutSpacing >= 0.1 && layoutSpacing <= 1 ? layoutSpacing : 1,
    showCompoundNodes:
      readEnvBoolean('NEXT_PUBLIC_SETTINGS_SHOW_COMPOUNDNODES', environment) ?? true,
    showVendorPackages:
      readEnvBoolean('NEXT_PUBLIC_SETTINGS_SHOW_VENDORPACKAGES', environment) ?? false,
    subPackageDepth:
      subPackageDepth !== undefined && Number.isInteger(subPackageDepth) && subPackageDepth >= 1
        ? subPackageDepth
        : 1,
  };
}

/*** Determines whether an environment value names a supported Cytoscape layout. */
function isSupportedLayout(value: string | undefined): value is LayoutOptions['name'] {
  return (
    value === 'breadthfirst' ||
    value === 'circle' ||
    value === 'concentric' ||
    value === 'elk' ||
    value === 'grid'
  );
}

interface SettingsEnvironment {
  readonly showCycles: boolean;
  readonly cytoscapeLayout: LayoutOptions['name'];
  readonly cytoscapeLayoutSpacing: number;
  readonly showCompoundNodes: boolean;
  readonly showVendorPackages: boolean;
  readonly subPackageDepth: number;
}
