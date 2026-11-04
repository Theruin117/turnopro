import { Prisma, PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { Prisma, PrismaClient };

export type DatabaseClient = PrismaClient;
export type DatabaseOptions = Prisma.PrismaClientOptions;

/**
 * Fábrica explícita para que cada proceso (API, worker, scripts) controle
 * su propio ciclo de vida. No se comparte una instancia global entre procesos.
 */
export function createDatabaseClient(options?: DatabaseOptions): PrismaClient {
  return new PrismaClient(options);
}
