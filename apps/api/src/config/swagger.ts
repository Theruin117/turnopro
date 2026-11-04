import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import type { AppConfigService } from './app-config.service';

export function setupSwagger(app: INestApplication, config: AppConfigService): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('TurnoPro API')
      .setDescription(
        [
          'API REST multi-tenant de TurnoPro.',
          '',
          'Todos los endpoints protegidos requieren `Authorization: Bearer <access_token>`.',
          'La organización activa se deriva del token y se valida contra una membresía activa;',
          'nunca se acepta un `organizationId` enviado por el cliente.',
        ].join('\n'),
      )
      .setVersion(config.version)
      .addServer(config.apiPublicUrl, 'Servidor local')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('health', 'Estado del servicio')
      .addTag('auth', 'Registro, sesión y refresh tokens')
      .addTag('organizations', 'Organización activa y equipo')
      .build(),
    { operationIdFactory: (_controllerKey, methodKey) => methodKey },
  );

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: false,
    customSiteTitle: 'TurnoPro API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });
}
