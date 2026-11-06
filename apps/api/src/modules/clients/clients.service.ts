import { Injectable } from '@nestjs/common';
import { type Prisma, type Client as ClientRecord } from '@turnopro/database';
import type { Client, ClientStatus, PaginatedResponse } from '@turnopro/contracts';
import { AppError, ErrorCode, type RequestMetadata } from '@turnopro/shared';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { ClientsQueryDto, CreateClientDto, UpdateClientDto } from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    organizationId: string,
    query: ClientsQueryDto,
  ): Promise<PaginatedResponse<Client>> {
    const { page, pageSize } = query;
    const where: Prisma.ClientWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [total, clients] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: clients.map(mapClient),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getById(organizationId: string, clientId: string): Promise<Client> {
    const client = await this.findOrThrow(organizationId, clientId);
    return mapClient(client);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateClientDto,
    meta: RequestMetadata,
  ): Promise<Client> {
    const client = await this.prisma.client.create({
      data: {
        organizationId,
        name: dto.name,
        email: dto.email || null,
        phone: dto.phone || null,
        notes: dto.notes || null,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'client.created',
      entity: 'client',
      entityId: client.id,
      metadata: { name: client.name },
      ...meta,
    });

    return mapClient(client);
  }

  async update(
    organizationId: string,
    actorUserId: string,
    clientId: string,
    dto: UpdateClientDto,
    meta: RequestMetadata,
  ): Promise<Client> {
    await this.findOrThrow(organizationId, clientId);

    if (Object.keys(dto).length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'Envía al menos un campo para actualizar',
      );
    }

    // tenant-scope-exempt: findOrThrow validó el cliente con organizationId
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.email === undefined ? {} : { email: dto.email || null }),
        ...(dto.phone === undefined ? {} : { phone: dto.phone || null }),
        ...(dto.notes === undefined ? {} : { notes: dto.notes || null }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'client.updated',
      entity: 'client',
      entityId: client.id,
      metadata: { fields: Object.keys(dto) },
      ...meta,
    });

    return mapClient(client);
  }

  async archive(
    organizationId: string,
    actorUserId: string,
    clientId: string,
    meta: RequestMetadata,
  ): Promise<Client> {
    const existing = await this.findOrThrow(organizationId, clientId);

    if (existing.status === 'ARCHIVED') {
      return mapClient(existing);
    }

    // tenant-scope-exempt: findOrThrow validó el cliente con organizationId
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { status: 'ARCHIVED' },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'client.archived',
      entity: 'client',
      entityId: client.id,
      ...meta,
    });

    return mapClient(client);
  }

  private async findOrThrow(
    organizationId: string,
    clientId: string,
  ): Promise<ClientRecord> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId },
    });

    if (!client) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El cliente no existe en esta organización',
      );
    }

    return client;
  }
}

function mapClient(client: ClientRecord): Client {
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    status: client.status as ClientStatus,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}
