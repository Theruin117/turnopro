import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';

import { ErrorCode, AppError } from '@turnopro/shared';

import type { AppConfigService } from './config/app-config.service';
import { flattenValidationErrors } from './common/validation/flatten-validation-errors';

/**
 * Configuración compartida entre `main.ts` y los tests e2e, para que ambos
 * ejecuten exactamente el mismo pipeline HTTP.
 */
export function configureApp(app: INestApplication, config: AppConfigService): void {
  const express = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };

  if (config.trustProxy) {
    express.set('trust proxy', 1);
  }

  app.use(
    (
      request: {
        headers: Record<string, string | string[] | undefined>;
        id?: string;
      },
      response: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      const incoming = request.headers['x-request-id'];
      const id =
        typeof incoming === 'string' && incoming.length <= 128
          ? incoming
          : request.id ?? randomUUID();
      request.id = id;
      response.setHeader('X-Request-Id', id);
      next();
    },
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: config.webOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix(config.apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
      exceptionFactory: (errors) =>
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          'La solicitud contiene datos inválidos',
          flattenValidationErrors(errors),
        ),
    }),
  );

  app.enableShutdownHooks();
}
