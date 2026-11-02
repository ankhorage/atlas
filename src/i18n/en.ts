import type { ILanguage } from '@/i18n/i18n';

const en: ILanguage = {
  // Navigation
  'nav.packages': 'Packages',
  'nav.sequence': 'Sequence',

  // Settings
  'settings.title': 'Settings',
  'settings.tree': 'Tree',
  'settings.rules': 'Rules',
  'settings.export': 'Export',
  'sidebar.tools': 'Sidebar tools',
  'settings.showCompoundNodes': 'Show Compound Nodes',
  'settings.showVendorPackages': 'Show Vendor',
  'settings.subPackageDepth': 'Subpackage depth',
  'settings.layout': 'Layout',
  'settings.layoutSpacing': 'Layout Spacing',
  'settings.filter': 'Filter',
  'settings.packagePrefix': 'Package prefix',
  'settings.dependency': 'Runtime dependencies',
  'settings.devDependency': 'Dev dependencies',
  'settings.peerDependency': 'Peer dependencies',
  'settings.optionalDependency': 'Optional dependencies',

  // Audit
  'audit.rules': 'Audit rules',
  'audit.loading': 'Loading audit…',
  'audit.loadError': 'Unable to load audit details.',
  'audit.noRules': 'No audit rules are enabled.',
  'audit.cycle': 'Cycle',
  'audit.cycles': 'cycles',
  'audit.findings': 'findings',
  'audit.imports': 'imports',
  'audit.cyclePath': 'Cycle path',
  'audit.dependencyEvidence': 'Dependency evidence',
  'audit.packages': 'packages',
  'audit.dependencyEdges': 'dependency edges',
  'audit.noEvidence': 'No source/import evidence available.',
  'audit.closeInspector': 'Close cycle inspector',
  'audit.rule.cyclicDependencies': 'Cyclic Dependencies',

  // Layouts
  breadthfirst: 'Breadthfirst',
  circle: 'Circle',
  concentric: 'Concentric',
  elk: 'Elk: Layered',
  grid: 'Grid',
};

export default en;
