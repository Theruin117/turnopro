import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { PrismaClient } from '@turnopro/database';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Cliente Prisma propiedad de la API.
 * La conexión es explícita para que el arranque falle si la base no está
 * disponible y para cerrar el pool ordenadamente al apagar el proceso.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfigService) {
    super({
      datasourceUrl: config.databaseUrl,
      log: config.isProduction ? ['error'] : ['warn', 'error'],
    });
  }

  async isHealthy(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
