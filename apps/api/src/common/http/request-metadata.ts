import type { Request } from 'express';

import type { RequestMetadata } from '@turnopro/shared';

/** Metadatos acotados para auditoría; nunca incluye cuerpos ni credenciales. */
export function getRequestMetadata(request: Request): RequestMetadata {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip?.slice(0, 64),
    userAgent:
      typeof userAgent === 'string' ? userAgent.slice(0, 512) : undefined,
  };
}
