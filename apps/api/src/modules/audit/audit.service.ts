import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

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
}
