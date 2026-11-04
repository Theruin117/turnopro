import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { AppError, ErrorCode, isRole } from '@turnopro/shared';
import type { Request } from 'express';

import { AppConfigService } from '../../config/app-config.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AccessTokenPayload } from '../types/authenticated-request';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Se requiere un token de acceso');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Se requiere un token de acceso');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwtAccessSecret,
        algorithms: ['HS256'],
        clockTolerance: 5,
      });

      if (
        !payload.sub ||
        !payload.org ||
        !payload.mid ||
        payload.type !== 'access' ||
        !isRole(payload.role)
      ) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Token de acceso inválido');
      }

      (request as Request & { auth: AccessTokenPayload }).auth = payload;
      return true;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const expired =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'TokenExpiredError';

      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        401,
        expired ? 'La sesión expiró' : 'Token de acceso inválido',
        expired ? { reason: 'TOKEN_EXPIRED' } : undefined,
      );
    }
  }
}
