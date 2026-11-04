import 'reflect-metadata';

import { Logger } from 'nestjs-pino';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './config/swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  configureApp(app, config);

  if (config.swaggerEnabled) {
    setupSwagger(app, config);
  }

  await app.listen(config.port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(
    `TurnoPro API escuchando en http://localhost:${config.port}/${config.apiPrefix} (${config.nodeEnv})`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  console.error('No se pudo iniciar la API', error);
  process.exit(1);
});
