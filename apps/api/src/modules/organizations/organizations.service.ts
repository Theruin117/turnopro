import { Injectable } from '@nestjs/common';
import type { Organization } from '@turnopro/database';
import type { AuthOrganization, MembershipListItem, PaginatedResponse } from '@turnopro/contracts';
import {
  AppError,
  ErrorCode,
  isValidCurrency,
  isValidTimezone,
  type RequestMetadata,
  type Role,
} from '@turnopro/shared';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { MembersQueryDto } from './dto/members-query.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCurrent(organizationId: string): Promise<AuthOrganization> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'La organización no existe');
    }

    return mapOrganization(organization);
  }

  async update(
    organizationId: string,
    actorUserId: string,
    dto: UpdateOrganizationDto,
    meta: RequestMetadata,
  ): Promise<AuthOrganization> {
    if (dto.timezone && !isValidTimezone(dto.timezone)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'La zona horaria no es válida',
        { field: 'timezone' },
      );
    }

    if (dto.currency && !isValidCurrency(dto.currency)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'La moneda no es válida',
        { field: 'currency' },
      );
    }

    if (
      dto.name === undefined &&
      dto.timezone === undefined &&
      dto.currency === undefined
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'Envía al menos un campo para actualizar',
      );
    }

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
        ...(dto.currency === undefined ? {} : { currency: dto.currency }),
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'organization.updated',
      entity: 'organization',
      entityId: organizationId,
      metadata: { fields: Object.keys(dto) },
      ...meta,
    });

    return mapOrganization(organization);
  }

  async listMembers(
    organizationId: string,
    query: MembersQueryDto,
  ): Promise<PaginatedResponse<MembershipListItem>> {
    const { page, pageSize } = query;
    const [total, members] = await this.prisma.$transaction([
      this.prisma.membership.count({ where: { organizationId } }),
      this.prisma.membership.findMany({
        where: { organizationId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: members.map((member) => ({
        id: member.id,
        role: member.role as Role,
        status: member.status,
        createdAt: member.createdAt.toISOString(),
        user: member.user,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}

function mapOrganization(organization: Organization): AuthOrganization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    timezone: organization.timezone,
    currency: organization.currency,
    status: organization.status,
    createdAt: organization.createdAt.toISOString(),
  };
}
