import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Membership,
  type Organization,
  type User,
} from '@turnopro/database';
import {
  AppError,
  ErrorCode,
  normalizeEmail,
  permissionsForRole,
  type RequestMetadata,
  type Role,
} from '@turnopro/shared';
import type { AuthContext, AuthSession } from '@turnopro/contracts';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

type SessionUser = Pick<User, 'id' | 'name' | 'email' | 'createdAt'>;

interface AuthResult {
  session: AuthSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

type MembershipWithOrganization = Membership & { organization: Organization };

const DUPLICATE_EMAIL = 'Ya existe una cuenta con ese correo electrónico';
const DUPLICATE_SLUG = 'Ese identificador de organización ya está en uso';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMetadata): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);
    const passwordHash = await this.password.hash(dto.password);

    let created: { organization: Organization; user: User; membership: Membership };

    try {
      created = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: dto.organizationName,
            slug: dto.organizationSlug,
          },
        });

        const user = await tx.user.create({
          data: {
            email,
            name: dto.name,
            passwordHash,
            lastLoginAt: new Date(),
          },
        });

        const membership = await tx.membership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        });

        return { organization, user, membership };
      });
    } catch (error) {
      throw mapRegistrationConflict(error);
    }

    await this.audit.record({
      organizationId: created.organization.id,
      actorUserId: created.user.id,
      action: 'auth.register',
      entity: 'organization',
      entityId: created.organization.id,
      ...meta,
    });

    return this.createSession({
      user: created.user,
      membership: created.membership,
      organization: created.organization,
      meta,
    });
  }

  async login(dto: LoginDto, meta: RequestMetadata): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw invalidCredentials();
    }

    const validPassword = await this.password.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      throw invalidCredentials();
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    if (memberships.length === 0) {
      throw new AppError(
        ErrorCode.MEMBERSHIP_INACTIVE,
        403,
        'Tu cuenta no tiene acceso a ninguna organización activa',
      );
    }

    let membership: MembershipWithOrganization;

    if (dto.organizationSlug) {
      const match = memberships.find(
        (item) => item.organization.slug === dto.organizationSlug,
      );
      if (!match) {
        throw invalidCredentials();
      }
      membership = match;
      assertMembershipUsable(membership);
    } else {
      const active = memberships.filter(
        (item) => item.status === 'ACTIVE' && item.organization.status === 'ACTIVE',
      );

      if (active.length === 0) {
        const suspended = memberships.some((item) => item.status !== 'ACTIVE');
        throw new AppError(
          suspended ? ErrorCode.MEMBERSHIP_INACTIVE : ErrorCode.ORGANIZATION_INACTIVE,
          403,
          suspended
            ? 'Tu acceso a la organización está suspendido'
            : 'La organización no se encuentra activa',
        );
      }

      if (active.length > 1) {
        throw new AppError(
          ErrorCode.ORGANIZATION_REQUIRED,
          409,
          'Perteneces a varias organizaciones. Indica cuál quieres usar.',
          {
            organizations: active.map((item) => ({
              slug: item.organization.slug,
              name: item.organization.name,
            })),
          },
        );
      }

      membership = active[0]!;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      action: 'auth.login',
      entity: 'membership',
      entityId: membership.id,
      ...meta,
    });

    return this.createSession({
      user: updatedUser,
      membership,
      organization: membership.organization,
      meta,
    });
  }

  async refresh(rawToken: string | undefined, meta: RequestMetadata): Promise<AuthResult> {
    if (!rawToken) {
      throw new AppError(
        ErrorCode.REFRESH_TOKEN_INVALID,
        401,
        'No hay una sesión renovable',
      );
    }

    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        membership: {
          include: { organization: true, user: true },
        },
      },
    });

    if (!stored) {
      throw new AppError(
        ErrorCode.REFRESH_TOKEN_INVALID,
        401,
        'La sesión no es válida. Inicia sesión de nuevo.',
      );
    }

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      await this.audit.record({
        organizationId: stored.organizationId,
        actorUserId: stored.userId,
        action: 'auth.refresh_reuse_detected',
        entity: 'refresh_token',
        entityId: stored.id,
        metadata: { familyId: stored.familyId },
        ...meta,
      });
      throw new AppError(
        ErrorCode.TOKEN_REUSED,
        401,
        'La sesión fue reutilizada. Por seguridad, se cerraron todas las sesiones de esta familia.',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      throw new AppError(
        ErrorCode.REFRESH_TOKEN_INVALID,
        401,
        'La sesión expiró. Inicia sesión de nuevo.',
      );
    }

    const { membership } = stored;
    assertMembershipUsable(membership);
    if (membership.user.status !== 'ACTIVE') {
      throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'La cuenta está deshabilitada');
    }

    const access = await this.tokens.issueAccessToken({
      userId: stored.userId,
      organizationId: stored.organizationId,
      membershipId: stored.membershipId,
      role: membership.role as Role,
    });
    const next = this.tokens.createRefreshToken(stored.familyId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.refreshToken.create({
          data: {
            id: next.id,
            userId: stored.userId,
            membershipId: stored.membershipId,
            organizationId: stored.organizationId,
            familyId: stored.familyId,
            tokenHash: next.tokenHash,
            expiresAt: next.expiresAt,
            ip: meta.ip?.slice(0, 64),
            userAgent: meta.userAgent?.slice(0, 512),
          },
        });

        const rotated = await tx.refreshToken.updateMany({
          where: { id: stored.id, revokedAt: null },
          data: {
            revokedAt: new Date(),
            lastUsedAt: new Date(),
            replacedByTokenId: next.id,
          },
        });

        if (rotated.count !== 1) {
          throw new AppError(
            ErrorCode.TOKEN_REUSED,
            401,
            'La sesión fue reutilizada. Inicia sesión de nuevo.',
          );
        }
      });
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.TOKEN_REUSED) {
        await this.revokeFamily(stored.familyId);
        await this.audit.record({
          organizationId: stored.organizationId,
          actorUserId: stored.userId,
          action: 'auth.refresh_reuse_detected',
          entity: 'refresh_token',
          entityId: stored.id,
          metadata: { familyId: stored.familyId, reason: 'concurrent_rotation' },
          ...meta,
        });
      }
      throw error;
    }

    return {
      session: this.toSession({
        accessToken: access.accessToken,
        expiresIn: access.expiresIn,
        user: membership.user,
        membership,
        organization: membership.organization,
      }),
      refreshToken: next.token,
      refreshExpiresAt: next.expiresAt,
    };
  }

  async logout(rawToken: string | undefined, meta: RequestMetadata): Promise<void> {
    if (!rawToken) {
      return;
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(rawToken) },
    });

    if (!stored) {
      return;
    }

    await this.revokeFamily(stored.familyId);
    await this.audit.record({
      organizationId: stored.organizationId,
      actorUserId: stored.userId,
      action: 'auth.logout',
      entity: 'refresh_token_family',
      entityId: stored.familyId,
      ...meta,
    });
  }

  me(input: {
    user: SessionUser;
    membership: Membership;
    organization: Organization;
  }): AuthContext {
    const role = input.membership.role as Role;
    return {
      user: {
        id: input.user.id,
        name: input.user.name,
        email: input.user.email,
        createdAt: input.user.createdAt.toISOString(),
      },
      organization: mapOrganization(input.organization),
      membership: {
        id: input.membership.id,
        role,
        permissions: permissionsForRole(role),
      },
    };
  }

  private async createSession(input: {
    user: SessionUser;
    membership: Membership;
    organization: Organization;
    meta: RequestMetadata;
    familyId?: string;
  }): Promise<AuthResult> {
    const refresh = this.tokens.createRefreshToken(input.familyId);
    const access = await this.tokens.issueAccessToken({
      userId: input.user.id,
      organizationId: input.organization.id,
      membershipId: input.membership.id,
      role: input.membership.role as Role,
    });

    await this.prisma.refreshToken.create({
      data: {
        id: refresh.id,
        userId: input.user.id,
        membershipId: input.membership.id,
        organizationId: input.organization.id,
        familyId: refresh.familyId,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
        lastUsedAt: new Date(),
        ip: input.meta.ip?.slice(0, 64),
        userAgent: input.meta.userAgent?.slice(0, 512),
      },
    });

    return {
      session: this.toSession({
        ...access,
        user: input.user,
        membership: input.membership,
        organization: input.organization,
      }),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  private toSession(input: {
    accessToken: string;
    expiresIn: number;
    user: SessionUser;
    membership: Membership;
    organization: Organization;
  }): AuthSession {
    const role = input.membership.role as Role;
    return {
      accessToken: input.accessToken,
      expiresIn: input.expiresIn,
      user: {
        id: input.user.id,
        name: input.user.name,
        email: input.user.email,
        createdAt: input.user.createdAt.toISOString(),
      },
      organization: mapOrganization(input.organization),
      membership: {
        id: input.membership.id,
        role,
        permissions: permissionsForRole(role),
      },
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function mapOrganization(organization: Organization) {
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

function assertMembershipUsable(membership: MembershipWithOrganization): void {
  if (membership.status !== 'ACTIVE') {
    throw new AppError(
      ErrorCode.MEMBERSHIP_INACTIVE,
      403,
      'Tu acceso a la organización está suspendido',
    );
  }
  if (membership.organization.status !== 'ACTIVE') {
    throw new AppError(
      ErrorCode.ORGANIZATION_INACTIVE,
      403,
      'La organización no se encuentra activa',
    );
  }
}

function invalidCredentials(): AppError {
  return new AppError(
    ErrorCode.INVALID_CREDENTIALS,
    401,
    'El correo o la contraseña no son correctos',
  );
}

function mapRegistrationConflict(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
    if (fields.some((field) => field.includes('email'))) {
      return new AppError(ErrorCode.EMAIL_TAKEN, 409, DUPLICATE_EMAIL);
    }
    if (fields.some((field) => field.includes('slug'))) {
      return new AppError(ErrorCode.SLUG_TAKEN, 409, DUPLICATE_SLUG);
    }
  }
  return error;
}
