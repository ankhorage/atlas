import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  entry: [
    '.prettierrc.js',
    'eslint.config.mjs',
    'eslint.local.config.mjs',
    'prettier.local.config.js',
    'paradox.config.mjs',
    'test/**/*.spec.{ts,tsx}',
    'test/benchmarks/*.ts',
  ],
  ignoreFiles: ['examples/**'],
  ignoreBinaries: ['mvn', 'gradle'],
});
