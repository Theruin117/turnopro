import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './config/swagger';

type ExpressHandler = (request: IncomingMessage, response: ServerResponse) => void;

let handlerPromise: Promise<ExpressHandler> | undefined;

/**
 * Adapta la aplicación NestJS/Express al runtime HTTP de Vercel.
 *
 * No se llama a `listen`: Vercel invoca el handler por petición. La promesa se
 * cachea para reutilizar el contenedor Nest y el pool de Prisma entre
 * invocaciones tibias.
 */
async function createHandler(): Promise<ExpressHandler> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  configureApp(app, config);

  if (config.swaggerEnabled) {
    setupSwagger(app, config);
  }

  await app.init();

  return app.getHttpAdapter().getInstance() as ExpressHandler;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const expressHandler = await (handlerPromise ??= createHandler());
  expressHandler(request, response);
}
