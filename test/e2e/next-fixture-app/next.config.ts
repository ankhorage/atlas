import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const root = resolve(__dirname, '../../..');
const aliases = {
  '@': resolve(root, 'src'),
  '@zora/ZoraProvider': resolve(root, '.ankh/zora/web/runtime/ZoraProvider'),
  '@zora/*': resolve(root, '.ankh/zora/web/components/*'),
};

const nextConfig: NextConfig = {
  agentRules: false,
  distDir: 'build',
  experimental: { externalDir: true },
  outputFileTracingRoot: root,
  turbopack: { root, resolveAlias: aliases },
  webpack: configuration => ({
    ...configuration,
    resolve: { ...configuration.resolve, alias: { ...configuration.resolve.alias, ...aliases } },
  }),
};

export default nextConfig;
