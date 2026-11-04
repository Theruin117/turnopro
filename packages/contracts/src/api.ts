import type { ErrorCode } from '@turnopro/shared';

export interface ApiErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
    timestamp: string;
    path?: string;
  };
}

export interface HealthCheck {
  status: 'up' | 'down';
  latencyMs?: number;
  message?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  checks?: Record<string, HealthCheck>;
}
