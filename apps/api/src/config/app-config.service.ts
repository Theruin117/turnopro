import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from './env';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get version(): string {
    return this.config.get('APP_VERSION', { infer: true });
  }

  get apiPrefix(): string {
    return this.config
      .get('API_PREFIX', { infer: true })
      .replace(/^\/+|\/+$/g, '');
  }

  get apiPublicUrl(): string {
    return this.config.get('API_PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
  }

  get swaggerEnabled(): boolean {
    return this.config.get('SWAGGER_ENABLED', { infer: true });
  }

  get webOrigins(): string[] {
    return this.config
      .get('WEB_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): string | undefined {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get jwtAccessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtAccessTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  get refreshTokenTtlDays(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }

  get refreshTokenTtlMs(): number {
    return this.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  }

  get cookieSecure(): boolean {
    return this.config.get('COOKIE_SECURE', { infer: true });
  }

  get cookieDomain(): string | undefined {
    return this.config.get('COOKIE_DOMAIN', { infer: true });
  }

  get logLevel(): string {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get rateLimitTtlSeconds(): number {
    return this.config.get('RATE_LIMIT_TTL_SECONDS', { infer: true });
  }

  get rateLimitLimit(): number {
    return this.config.get('RATE_LIMIT_LIMIT', { infer: true });
  }

  get trustProxy(): boolean {
    return this.config.get('TRUST_PROXY', { infer: true });
  }
}
