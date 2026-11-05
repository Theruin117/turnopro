import { Injectable } from '@nestjs/common';
import { type Prisma, type Service as ServiceRecord } from '@turnopro/database';
import type { PaginatedResponse, Service, ServiceStatus } from '@turnopro/contracts';
import { AppError, ErrorCode, type RequestMetadata } from '@turnopro/shared';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { CreateServiceDto, ServicesQueryDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    organizationId: string,
    query: ServicesQueryDto,
  ): Promise<PaginatedResponse<Service>> {
    const { page, pageSize } = query;
    const where: Prisma.ServiceWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [total, services] = await this.prisma.$transaction([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: services.map(mapService),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getById(organizationId: string, serviceId: string): Promise<Service> {
    const service = await this.findOrThrow(organizationId, serviceId);
    return mapService(service);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateServiceDto,
    meta: RequestMetadata,
  ): Promise<Service> {
    await this.ensureNameAvailable(organizationId, dto.name);

    const service = await this.prisma.service.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        durationMinutes: dto.durationMinutes,
        bufferBeforeMinutes: dto.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: dto.bufferAfterMinutes ?? 0,
        priceCents: dto.priceCents ?? 0,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'service.created',
      entity: 'service',
      entityId: service.id,
      metadata: { name: service.name, durationMinutes: service.durationMinutes },
      ...meta,
    });

    return mapService(service);
  }

  async update(
    organizationId: string,
    actorUserId: string,
    serviceId: string,
    dto: UpdateServiceDto,
    meta: RequestMetadata,
  ): Promise<Service> {
    await this.findOrThrow(organizationId, serviceId);

    if (dto.name) {
      await this.ensureNameAvailable(organizationId, dto.name, serviceId);
    }

    if (Object.keys(dto).length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'Envía al menos un campo para actualizar',
      );
    }

    const service = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description || null }),
        ...(dto.durationMinutes === undefined
          ? {}
          : { durationMinutes: dto.durationMinutes }),
        ...(dto.bufferBeforeMinutes === undefined
          ? {}
          : { bufferBeforeMinutes: dto.bufferBeforeMinutes }),
        ...(dto.bufferAfterMinutes === undefined
          ? {}
          : { bufferAfterMinutes: dto.bufferAfterMinutes }),
        ...(dto.priceCents === undefined ? {} : { priceCents: dto.priceCents }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'service.updated',
      entity: 'service',
      entityId: service.id,
      metadata: { fields: Object.keys(dto) },
      ...meta,
    });

    return mapService(service);
  }

  async archive(
    organizationId: string,
    actorUserId: string,
    serviceId: string,
    meta: RequestMetadata,
  ): Promise<Service> {
    const existing = await this.findOrThrow(organizationId, serviceId);

    if (existing.status === 'ARCHIVED') {
      return mapService(existing);
    }

    const service = await this.prisma.service.update({
      where: { id: serviceId },
      data: { status: 'ARCHIVED' },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'service.archived',
      entity: 'service',
      entityId: service.id,
      ...meta,
    });

    return mapService(service);
  }

  private async findOrThrow(
    organizationId: string,
    serviceId: string,
  ): Promise<ServiceRecord> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El servicio no existe en esta organización',
      );
    }

    return service;
  }

  private async ensureNameAvailable(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.service.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new AppError(
        ErrorCode.CONFLICT,
        409,
        'Ya existe un servicio con ese nombre',
        { field: 'name' },
      );
    }
  }
}

function mapService(service: ServiceRecord): Service {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    priceCents: service.priceCents,
    status: service.status as ServiceStatus,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}
