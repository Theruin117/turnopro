import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Acceso único a Redis para la API.
 * La conexión es perezosa: la API puede arrancar aunque Redis esté caído y
 * `/health/ready` lo reporta como dependencia degradada.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: AppConfigService) {
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

  get connection(): Redis {
    return this.client;
  }

  async ping(): Promise<number> {
    const startedAt = performance.now();
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    }
    await this.client.ping();
    return Math.round((performance.now() - startedAt) * 100) / 100;
  }

  async isHealthy(): Promise<boolean> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    }
    const reply = await this.client.ping();
    return reply === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}
