import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    '/*': ['./examples/typescript/my-app/**/*'],
  },
  output: 'standalone',
  turbopack: {
    resolveAlias: { 'react-native': 'react-native-web' },
  },
  webpack: configuration => ({
    ...configuration,
    resolve: {
      ...configuration.resolve,
      alias: { ...configuration.resolve.alias, 'react-native$': 'react-native-web' },
      extensions: ['.web.tsx', '.web.ts', '.web.js', ...(configuration.resolve.extensions ?? [])],
    },
  }),
};

export default nextConfig;
