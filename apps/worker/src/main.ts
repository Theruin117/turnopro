import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

import { createDatabaseClient, type PrismaClient } from '@turnopro/database';
import type { HealthCheckResult, HealthReport } from '@turnopro/shared';

import { loadWorkerEnv, type WorkerEnv } from './env';

const QUEUE_NAME = 'turnopro-maintenance';
const SCHEDULER_ID = 'maintenance-cleanup';

interface MaintenanceResult {
  expiredRefreshTokens: number;
  processedOutboxEvents: number;
}

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  context: Record<string, unknown> = {},
): void {
  console[level](
    JSON.stringify({
      time: new Date().toISOString(),
      level,
      service: 'turnopro-worker',
      message,
      ...context,
    }),
  );
}

class MaintenanceWorker {
  private readonly prisma: PrismaClient;
  private readonly queueConnection: Redis;
  private readonly workerConnection: Redis;
  private readonly queue: Queue;
  private readonly worker: Worker<Record<string, never>, MaintenanceResult>;
  private readonly server = createServer((request, response) => {
    void this.handleRequest(request, response);
  });
  private readonly startedAt = Date.now();
  private shuttingDown = false;

  constructor(private readonly env: WorkerEnv) {
    this.prisma = createDatabaseClient({ datasourceUrl: env.DATABASE_URL });
    this.queueConnection = createRedis(env.REDIS_URL);
    this.workerConnection = createRedis(env.REDIS_URL);

    this.queue = new Queue<Record<string, never>>(QUEUE_NAME, {
      connection: this.queueConnection,
    });

    this.worker = new Worker<Record<string, never>, MaintenanceResult>(
      QUEUE_NAME,
      async (job: Job<Record<string, never>>) => this.process(job),
      {
        connection: this.workerConnection,
        concurrency: 1,
      },
    );
  }

  async start(): Promise<void> {
    await this.queue.waitUntilReady();
    await this.worker.waitUntilReady();

    this.worker.on('completed', (job, result: MaintenanceResult) => {
      log('info', 'Trabajo completado', {
        jobId: job.id,
        jobName: job.name,
        ...result,
      });
    });

    this.worker.on('failed', (job, error) => {
      log('error', 'Trabajo fallido', {
        jobId: job?.id,
        jobName: job?.name,
        error: error.message,
      });
    });

    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { every: this.env.MAINTENANCE_INTERVAL_MINUTES * 60_000 },
      {
        name: 'maintenance.cleanup',
        data: {},
        opts: {
          removeOnComplete: { age: 86_400, count: 100 },
          removeOnFail: { age: 604_800, count: 500 },
        },
      },
    );

    await this.listen();

    log('info', 'Worker iniciado', {
      queue: QUEUE_NAME,
      healthPort: this.env.WORKER_HEALTH_PORT,
      intervalMinutes: this.env.MAINTENANCE_INTERVAL_MINUTES,
    });
  }

  async stop(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;

    log('info', 'Deteniendo worker');

    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
    await this.worker.close();
    await this.queue.close();
    await this.queueConnection.quit().catch(() => this.queueConnection.disconnect());
    await this.workerConnection.quit().catch(() => this.workerConnection.disconnect());
    await this.prisma.$disconnect();

    log('info', 'Worker detenido');
  }

  private async process(job: Job<Record<string, never>>): Promise<MaintenanceResult> {
    if (job.name !== 'maintenance.cleanup') {
      throw new Error(`Trabajo no soportado: ${job.name}`);
    }

    const expiredBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const outboxBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [expiredRefreshTokens, processedOutboxEvents] = await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: expiredBefore } },
      }),
      this.prisma.outboxEvent.deleteMany({
        where: { status: 'PROCESSED', processedAt: { lt: outboxBefore } },
      }),
    ]);

    return {
      expiredRefreshTokens: expiredRefreshTokens.count,
      processedOutboxEvents: processedOutboxEvents.count,
    };
  }

  private async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.env.WORKER_HEALTH_PORT, '0.0.0.0', () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Método no permitido' });
      return;
    }

    if (url.pathname === '/health/live') {
      sendJson(response, 200, this.report('ok', {}));
      return;
    }

    if (url.pathname === '/health/ready') {
      const [database, redis] = await Promise.all([
        timed(() => this.checkDatabase()),
        timed(() => this.checkRedis()),
      ]);
      const workerRunning = this.worker.isRunning();
      const checks: Record<string, HealthCheckResult> = {
        database,
        redis,
        worker: workerRunning
          ? { status: 'up' }
          : { status: 'down', message: 'El worker no está procesando trabajos' },
      };
      const ok = Object.values(checks).every((check) => check.status === 'up');
      sendJson(response, ok ? 200 : 503, this.report(ok ? 'ok' : 'degraded', checks));
      return;
    }

    sendJson(response, 404, { error: 'Ruta no encontrada' });
  }

  private async checkDatabase(): Promise<boolean> {
    await this.prisma.$queryRaw`SELECT 1`;
    return true;
  }

  private async checkRedis(): Promise<boolean> {
    return (await this.workerConnection.ping()) === 'PONG';
  }

  private report(
    status: HealthReport['status'],
    checks: Record<string, HealthCheckResult>,
  ): HealthReport {
    return {
      status,
      service: 'turnopro-worker',
      version: this.env.APP_VERSION,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      checks,
    };
  }
}

function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });
}

async function timed(check: () => Promise<boolean>): Promise<HealthCheckResult> {
  const startedAt = performance.now();
  try {
    const up = await check();
    return up
      ? { status: 'up', latencyMs: Math.round(performance.now() - startedAt) }
      : {
          status: 'down',
          latencyMs: Math.round(performance.now() - startedAt),
          message: 'La dependencia respondió de forma inesperada',
        };
  } catch {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - startedAt),
      message: 'La dependencia no está disponible',
    };
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function main(): Promise<void> {
  const env = loadWorkerEnv();
  const worker = new MaintenanceWorker(env);

  const shutdown = (signal: string): void => {
    log('info', `Señal ${signal} recibida`);
    void worker
      .stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        log('error', 'Fallo al detener el worker', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await worker.start();
}

main().catch((error: unknown) => {
  log('error', 'No se pudo iniciar el worker', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
