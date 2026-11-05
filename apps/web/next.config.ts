import type { NextConfig } from 'next';

/**
 * En Vercel la web y la API viven en dominios distintos (`*.vercel.app`),
 * que son sitios diferentes. Para que la cookie `SameSite=Lax` del refresh
 * token viaje en las peticiones del navegador, la web proxya `/api/v1/*`
 * hacia la API. En local no se define `API_PROXY_TARGET` y la web llama
 * directamente a `http://localhost:3001`.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@turnopro/ui', '@turnopro/contracts', '@turnopro/shared'],
  async rewrites() {
    if (!apiProxyTarget) {
      return [];
    }
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
