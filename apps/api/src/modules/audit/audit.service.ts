import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@turnopro/database';
import type { AuditLogEntry, PaginatedResponse } from '@turnopro/contracts';
import { AppError, ErrorCode } from '@turnopro/shared';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { AuditQueryDto } from './dto/audit-query.dto';

export interface AuditInput {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * La auditoría es parte del flujo de negocio, no un log técnico:
   * cualquier fallo al persistirla se propaga para no perder trazabilidad.
   */
  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          metadata: input.metadata as never,
          ip: input.ip ?? null,
          userAgent: input.userAgent?.slice(0, 512) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`No se pudo persistir la auditoría ${input.action}`, error);
      throw error;
    }
  }

  async list(
    organizationId: string,
    query: AuditQueryDto,
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const { page, pageSize } = query;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to && from >= to) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'El rango de fechas no es válido',
        { field: 'from' },
      );
    }

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lt: to } : {}),
            },
          }
        : {}),
    };

    const [total, logs] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        metadata: (log.metadata as Record<string, unknown> | null) ?? null,
        ip: log.ip,
        userAgent: log.userAgent,
        createdAt: log.createdAt.toISOString(),
        actor: log.actor,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
