import { Injectable } from '@nestjs/common';
import { Prisma, type Organization } from '@turnopro/database';
import type {
  AuthOrganization,
  MembershipListItem,
  PaginatedResponse,
} from '@turnopro/contracts';
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
import type { UpdateMemberDto } from './dto/update-member.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';

const MEMBER_UPDATE_ATTEMPTS = 2;

type MembershipWithUser = Prisma.MembershipGetPayload<{
  include: { user: { select: { id: true; name: true; email: true } } };
}>;

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
      items: members.map(mapMember),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async updateMember(
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    membershipId: string,
    dto: UpdateMemberDto,
    meta: RequestMetadata,
  ): Promise<MembershipListItem> {
    if (dto.role === undefined && dto.status === undefined) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'Envía al menos un campo para actualizar',
      );
    }

    const updated = await this.updateMemberWithRetry(
      organizationId,
      actorUserId,
      actorRole,
      membershipId,
      dto,
    );

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'member.updated',
      entity: 'membership',
      entityId: membershipId,
      metadata: {
        userId: updated.userId,
        from: updated.previous,
        to: { role: updated.member.role, status: updated.member.status },
      },
      ...meta,
    });

    return mapMember(updated.member);
  }

  private async updateMemberWithRetry(
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    membershipId: string,
    dto: UpdateMemberDto,
  ): Promise<{ member: MembershipWithUser; userId: string; previous: { role: string; status: string } }> {
    for (let attempt = 1; attempt <= MEMBER_UPDATE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) =>
            this.updateMemberInsideTransaction(
              tx,
              organizationId,
              actorUserId,
              actorRole,
              membershipId,
              dto,
            ),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (isSerializationFailure(error) && attempt < MEMBER_UPDATE_ATTEMPTS) {
          continue;
        }

        if (isSerializationFailure(error)) {
          throw new AppError(
            ErrorCode.CONFLICT,
            409,
            'No se pudo actualizar el miembro por concurrencia; intenta de nuevo',
          );
        }

        throw error;
      }
    }

    throw new AppError(
      ErrorCode.CONFLICT,
      409,
      'No se pudo actualizar el miembro; intenta de nuevo',
    );
  }

  private async updateMemberInsideTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    membershipId: string,
    dto: UpdateMemberDto,
  ): Promise<{ member: MembershipWithUser; userId: string; previous: { role: string; status: string } }> {
    const member = await tx.membership.findFirst({
      where: { id: membershipId, organizationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!member) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El miembro no existe en esta organización',
      );
    }

    if (member.userId === actorUserId) {
      throw new AppError(
        ErrorCode.CONFLICT,
        409,
        'No puedes cambiar tu propio rol o estado',
      );
    }

    if (member.role === 'OWNER' && actorRole !== 'OWNER') {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        403,
        'Solo un OWNER puede modificar a otro OWNER',
      );
    }

    if (dto.role === 'OWNER' && actorRole !== 'OWNER') {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        403,
        'Solo un OWNER puede asignar el rol OWNER',
      );
    }

    const nextRole = dto.role ?? member.role;
    const nextStatus = dto.status ?? member.status;

    if (
      member.role === 'OWNER' &&
      member.status === 'ACTIVE' &&
      (nextRole !== 'OWNER' || nextStatus !== 'ACTIVE')
    ) {
      const activeOwners = await tx.membership.count({
        where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
      });

      if (activeOwners <= 1) {
        throw new AppError(
          ErrorCode.CONFLICT,
          409,
          'La organización debe conservar al menos un OWNER activo',
        );
      }
    }

    const result = await tx.membership.update({
      where: { id: membershipId },
      data: { role: nextRole, status: nextStatus },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Salvaguarda final dentro de la misma transacción: nunca dejar la
    // organización sin un OWNER activo.
    if (result.role !== 'OWNER' || result.status !== 'ACTIVE') {
      const remainingOwners = await tx.membership.count({
        where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
      });

      if (remainingOwners === 0) {
        throw new AppError(
          ErrorCode.CONFLICT,
          409,
          'La organización debe conservar al menos un OWNER activo',
        );
      }
    }

    return {
      member: result,
      userId: result.userId,
      previous: { role: member.role, status: member.status },
    };
  }
}

function mapMember(member: MembershipWithUser): MembershipListItem {
  return {
    id: member.id,
    role: member.role as Role,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
    user: member.user,
  };
}

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return (
    code === '40001' ||
    code === '40P01' ||
    error.message.includes('40001') ||
    error.message.includes('40P01')
  );
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
