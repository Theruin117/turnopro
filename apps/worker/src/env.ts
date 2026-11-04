import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().trim().default('0.1.0'),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), 'DATABASE_URL inválida'),
  REDIS_URL: z
    .string()
    .min(1)
    .refine((value) => /^rediss?:\/\//.test(value), 'REDIS_URL inválida'),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
  MAINTENANCE_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1_440).default(60),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadWorkerEnv(raw: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración del worker inválida:\n${details}`);
  }
  return result.data;
}
