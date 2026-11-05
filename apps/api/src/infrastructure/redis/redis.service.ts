import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Acceso único a Redis para la API.
 *
 * `REDIS_URL` es opcional: la API puede desplegarse en un runtime serverless
 * sin Redis (el worker BullMQ vive en otro host). Cuando no está configurado,
 * `/health/ready` reporta la dependencia como no configurada en lugar de
 * intentar conectarse. La conexión es perezosa: la API arranca aunque Redis
 * esté caído.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;

  constructor(config: AppConfigService) {
    if (!config.redisUrl) {
      this.logger.warn('REDIS_URL no configurada: la API funcionará sin Redis.');
      this.client = null;
      return;
    }

    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      connectTimeout: 3_000,
    });

    this.client.on('error', (error: Error) => {
      this.logger.warn(`Error de Redis: ${error.message}`);
    });
  }

  get configured(): boolean {
    return this.client !== null;
  }

  get connection(): Redis {
    if (!this.client) {
      throw new Error('Redis no está configurado en este despliegue.');
    }
    return this.client;
  }

  async ping(): Promise<number> {
    const client = this.connection;
    const startedAt = performance.now();
    if (client.status === 'wait' || client.status === 'end') {
      await client.connect();
    }
    await client.ping();
    return Math.round((performance.now() - startedAt) * 100) / 100;
  }

  async isHealthy(): Promise<boolean> {
    const client = this.client;
    if (!client) {
      return false;
    }
    if (client.status === 'wait' || client.status === 'end') {
      await client.connect();
    }
    const reply = await client.ping();
    return reply === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}
