import { createKnipConfig } from '@ankhorage/devtools/knip';

const atlasKnipConfig = createKnipConfig({
  entry: [
    '.prettierrc.js',
    'eslint.config.mjs',
    'eslint.local.config.mjs',
    'prettier.local.config.js',
    'paradox.config.mjs',
    'test/**/*.spec.{ts,tsx}',
    'src/features/offline-export/adapters/inbound/browser/bootstrapOfflineWorkspace.tsx',
    'test/benchmarks/*.ts',
    'test/e2e/compoundSelectionHarness.tsx',
    'test/e2e/next-fixture-app/app/**/*.tsx',
    'test/e2e/next-fixture-app/app/**/*.ts',
  ],
  // The project-detector spec reads this nested workspace from disk at runtime; Knip cannot
  // statically resolve that fixture-data path as an import.
  ignoreFiles: [
    '.agents/skills/zora-designer/scripts/**/*.ts',
    'examples/**',
    'test/fixtures/typescript/compound-selection/src/**/*.ts',
    'test/fixtures/typescript/nested-workspace/packages/dashboard/src/index.ts',
    // Workspace repository-runtime specs likewise analyze these fixture projects from disk.
    'test/fixtures/workspace-multi/**/*.ts',
  ],
  ignoreBinaries: ['mvn', 'gradle'],
  // These packages are resolved by supported published dynamic providers, not static imports.
  ignoreDependencies: ['@ankhorage/infra-local', '@ankhorage/infra-minikube'],
});

// The fixture config resolves the test app's external source-root alias to an absolute path.
export default { ...atlasKnipConfig, ignoreUnresolved: [/\/src$/] };
