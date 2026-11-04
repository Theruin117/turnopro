import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppError, ErrorCode, hasPermission, type Permission } from '@turnopro/shared';

import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.membership) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sesión no válida');
    }

    const missing = required.filter(
      (permission) => !hasPermission(request.membership.role, permission),
    );

    if (missing.length > 0) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        403,
        'No tienes permisos para realizar esta acción',
        { missingPermissions: missing },
      );
    }

    return true;
  }
}
