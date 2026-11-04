import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AppError, ErrorCode } from '@turnopro/shared';
import type { Request } from 'express';

import { AppConfigService } from '../../config/app-config.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF para endpoints que aceptan la cookie de refresh.
 * Un navegador siempre envía `Origin` en peticiones cross-site; exigimos que
 * coincida con las origins permitidas y rechazamos orígenes ausentes.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const origin = request.headers.origin;
    if (!origin || !this.config.webOrigins.includes(origin)) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        403,
        'Origen de la solicitud no permitido',
      );
    }

    return true;
  }
}
