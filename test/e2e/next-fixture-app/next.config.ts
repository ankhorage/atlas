import { resolve } from 'node:path';

import type { NextConfig } from 'next';

const root = resolve(__dirname, '../../..');
const aliases = {
  '@': resolve(root, 'src'),
};

const nextConfig: NextConfig = {
  agentRules: false,
  distDir: 'build',
  env: { ATLAS_FIXTURE_ROOT: resolve(root, 'test/fixtures/workspace-multi') },
  experimental: { externalDir: true },
  outputFileTracingRoot: root,
  turbopack: { root, resolveAlias: aliases },
  webpack: configuration => ({
    ...configuration,
    resolve: { ...configuration.resolve, alias: { ...configuration.resolve.alias, ...aliases } },
  }),
};

export default nextConfig;
