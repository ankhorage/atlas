import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    '/*': ['./examples/typescript/my-app/**/*'],
  },
  output: 'standalone',
};

export default nextConfig;
