#!/usr/bin/env node
/**
 * Worker BullMQ en sandbox (sólo demostración).
 *
 * Arranca un Redis local en 127.0.0.1:6380 y supervisa
 * `apps/worker/dist/main.js`. Si el worker termina, lo reinicia con backoff.
 *
 * NO es un despliegue de producción: el proceso y el Redis viven mientras dure
 * el sandbox. Para producción usa la sección "Worker BullMQ" de
 * docs/DEPLOYMENT.md.
 *
 * Uso:
 *   pnpm --filter @turnopro/worker build
 *   node scripts/worker-sandbox.mjs
 *
 * Variables opcionales:
 *   WORKER_DATABASE_URL  Cadena de PostgreSQL para el worker. Si no existe, se
 *                        usa DATABASE_URL del `.env`. Debe ser el session
 *                        pooler (`:5432`), nunca el transaction pooler (`:6543`).
 *   WORKER_HEALTH_PORT   Puerto del health server del worker (3002 por defecto).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env');
const REDIS_PORT = 6380;
const REDIS_DIR = resolve(ROOT, '.data/redis');
const WORKER_ENTRY = resolve(ROOT, 'apps/worker/dist/main.js');
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;

let redisChild = null;
let workerChild = null;
let backoffTimer = null;
let shuttingDown = false;
let restartDelay = INITIAL_BACKOFF_MS;

function log(message, context = {}) {
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'info',
      service: 'worker-sandbox',
      message,
      ...context,
    }),
  );
}

function loadEnvironment() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(
      'No existe .env. Ejecuta `pnpm env:init` o crea el archivo antes de arrancar el sandbox.',
    );
  }
  process.loadEnvFile(ENV_PATH);
}

function resolveDatabaseUrl() {
  const url =
    process.env.WORKER_DATABASE_URL ??
    process.env.SUPABASE_SESSION_POOLER_URL ??
    process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'Falta DATABASE_URL (o WORKER_DATABASE_URL) para el worker.',
    );
  }

  if (/:6543(\/|\?|$)/.test(url) || url.includes('pgbouncer=true')) {
    throw new Error(
      'El worker necesita el session pooler de PostgreSQL (:5432). ' +
        'El transaction pooler (:6543) no mantiene conexiones persistentes.',
    );
  }

  return url;
}

function pingRedis(port, timeoutMs = 500) {
  return new Promise((resolvePing) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolvePing(value);
    };

    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });
    socket.on('data', (chunk) => {
      if (chunk.toString().includes('PONG')) {
        socket.destroy();
        finish(true);
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      finish(false);
    });
    socket.on('error', () => {
      finish(false);
    });
  });
}

async function waitForRedis(child, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `redis-server terminó con código ${child.exitCode}. Revisa que el puerto ${REDIS_PORT} esté libre.`,
      );
    }
    if (await pingRedis(REDIS_PORT)) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Redis no respondió en 127.0.0.1:${REDIS_PORT}.`);
}

async function startRedis() {
  if (await pingRedis(REDIS_PORT)) {
    log('Redis ya estaba activo; se reutiliza', { port: REDIS_PORT });
    return null;
  }

  mkdirSync(REDIS_DIR, { recursive: true });

  const child = spawn(
    'redis-server',
    [
      '--port',
      String(REDIS_PORT),
      '--bind',
      '127.0.0.1',
      '--dir',
      REDIS_DIR,
      '--appendonly',
      'yes',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  child.stdout.on('data', (chunk) => process.stderr.write(`[redis] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[redis] ${chunk}`));

  await waitForRedis(child);
  log('Redis de sandbox iniciado', { port: REDIS_PORT, dir: REDIS_DIR });
  return child;
}

function startWorker(databaseUrl, healthPort) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [WORKER_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      REDIS_URL: `redis://127.0.0.1:${REDIS_PORT}`,
      WORKER_HEALTH_PORT: String(healthPort),
      NODE_ENV: process.env.NODE_ENV ?? 'development',
    },
    stdio: 'inherit',
  });

  workerChild = child;
  log('Worker lanzado', { pid: child.pid, healthPort });

  child.on('exit', (code, signal) => {
    if (workerChild === child) workerChild = null;
    if (shuttingDown) return;

    // Si el proceso estuvo estable, volvemos al backoff inicial.
    if (Date.now() - startedAt > 60_000) {
      restartDelay = INITIAL_BACKOFF_MS;
    }

    log('El worker terminó; se reiniciará', {
      code,
      signal,
      delaySeconds: restartDelay / 1_000,
    });

    backoffTimer = setTimeout(() => {
      backoffTimer = null;
      startWorker(databaseUrl, healthPort);
    }, restartDelay);

    restartDelay = Math.min(restartDelay * 2, MAX_BACKOFF_MS);
  });
}

function stopChild(child, name, timeoutMs = 10_000) {
  return new Promise((resolveStop) => {
    if (!child || child.exitCode !== null) {
      resolveStop();
      return;
    }

    const timer = setTimeout(() => {
      log(`Forzando cierre de ${name}`, { pid: child.pid });
      child.kill('SIGKILL');
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timer);
      resolveStop();
    });

    child.kill('SIGTERM');
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  log(`Señal ${signal} recibida; cerrando el sandbox`);
  if (backoffTimer) {
    clearTimeout(backoffTimer);
    backoffTimer = null;
  }

  await stopChild(workerChild, 'worker');
  await stopChild(redisChild, 'redis');
  process.exit(0);
}

async function main() {
  if (!existsSync(WORKER_ENTRY)) {
    throw new Error(
      'No existe apps/worker/dist/main.js. Compila primero con ' +
        '`pnpm --filter @turnopro/worker build`.',
    );
  }

  loadEnvironment();

  const databaseUrl = resolveDatabaseUrl();
  const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 3002);
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65_535) {
    throw new Error('WORKER_HEALTH_PORT no es un puerto válido.');
  }

  log('Sandbox de demostración: no usar como worker de producción');
  redisChild = await startRedis();
  startWorker(databaseUrl, healthPort);

  log('Worker en sandbox activo', {
    health: `http://127.0.0.1:${healthPort}/health/ready`,
    databaseHost: new URL(databaseUrl).host,
  });
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((error) => {
  log('No se pudo arrancar el sandbox', {
    error: error instanceof Error ? error.message : String(error),
  });
  void shutdown('error');
});
