import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppError, ErrorCode } from '@turnopro/shared';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Convierte el token en una sesión de tenant verificada contra la base de datos.
 * Si la membresía fue revocada, el rol cambió o la organización fue suspendida,
 * el token deja de ser suficiente.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sesión no válida');
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: request.auth.mid,
        userId: request.auth.sub,
        organizationId: request.auth.org,
        status: 'ACTIVE',
      },
      include: {
        organization: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!membership) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        401,
        'La sesión ya no es válida para esta organización',
      );
    }

    if (membership.user.status !== 'ACTIVE') {
      throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'La cuenta está deshabilitada');
    }

    if (membership.organization.status !== 'ACTIVE') {
      throw new AppError(
        ErrorCode.ORGANIZATION_INACTIVE,
        403,
        'La organización no se encuentra activa',
      );
    }

    request.user = membership.user;
    request.membership = membership;
    request.organization = membership.organization;
    request.auth.role = membership.role;

    return true;
  }
}
