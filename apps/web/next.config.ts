import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@turnopro/ui', '@turnopro/contracts', '@turnopro/shared'],
};

export default nextConfig;
