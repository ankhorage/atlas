import { resolve } from 'node:path';

import type { NextConfig } from 'next';

const root = resolve(__dirname, '../../..');
const aliases = {
  '@': resolve(root, 'src'),
};

const nextConfig: NextConfig = {
  agentRules: false,
  distDir: process.env.ATLAS_FIXTURE_DIST_DIR ?? 'build',
  env: { ATLAS_FIXTURE_ROOT: resolve(root, 'test/fixtures/workspace-multi') },
  experimental: { externalDir: true },
  outputFileTracingRoot: root,
  typescript: { tsconfigPath: 'tsconfig.next.json' },
  turbopack: { root, resolveAlias: aliases },
  webpack: configuration => ({
    ...configuration,
    resolve: { ...configuration.resolve, alias: { ...configuration.resolve.alias, ...aliases } },
  }),
};

export default nextConfig;
