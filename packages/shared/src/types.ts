import type { Role } from './rbac';

/** Identidad mínima derivada de un access token válido y de la membresía vigente. */
export interface TenantContext {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: Role;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}

export interface HealthCheckResult {
  status: 'up' | 'down';
  latencyMs?: number;
  message?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: Record<string, HealthCheckResult>;
}
