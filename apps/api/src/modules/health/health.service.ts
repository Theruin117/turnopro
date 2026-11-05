import { Injectable } from '@nestjs/common';

import type { HealthCheckResult, HealthReport } from '@turnopro/shared';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  liveness(): HealthReport {
    return {
      status: 'ok',
      service: 'turnopro-api',
      version: this.config.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {},
    };
  }

  async readiness(): Promise<HealthReport> {
    const redisCheck: Promise<HealthCheckResult> = this.config.redisUrl
      ? this.timed(() => this.redis.isHealthy())
      : Promise.resolve({ status: 'down', message: 'Redis no configurado en este despliegue' });

    const [database, redis] = await Promise.all([
      this.timed(() => this.prisma.isHealthy()),
      redisCheck,
    ]);

    const checks = { database, redis };
    const ok = Object.values(checks).every((check) => check.status === 'up');

    return {
      status: ok ? 'ok' : 'degraded',
      service: 'turnopro-api',
      version: this.config.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks,
    };
  }

  private async timed(check: () => Promise<boolean>): Promise<HealthCheckResult> {
    const startedAt = performance.now();
    try {
      const up = await check();
      const latencyMs = Math.round(performance.now() - startedAt);
      return up
        ? { status: 'up', latencyMs }
        : { status: 'down', latencyMs, message: 'La dependencia no respondió correctamente' };
    } catch {
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
        message: 'La dependencia no está disponible',
      };
    }
  }
}
