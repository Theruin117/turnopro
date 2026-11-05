import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { AppConfigService } from '../../src/config/app-config.service';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

const API = '/api/v1';
const suffix = randomUUID().slice(0, 8);

interface TenantFixture {
  organizationId: string;
  membershipId: string;
  slug: string;
  email: string;
  accessToken: string;
}

interface MemberFixture {
  userId: string;
  membershipId: string;
  email: string;
  accessToken: string;
}

let app: INestApplication;
let prisma: PrismaService;
let server: Parameters<typeof request>[0];
let tenantA: TenantFixture;
let tenantB: TenantFixture;
let adminMember: MemberFixture;
let staffMember: MemberFixture;
const extraEmails: string[] = [];

async function registerTenant(label: string): Promise<TenantFixture> {
  const email = `members-${label}-${suffix}@demo.local`;
  const slug = `members-${label}-${suffix}`;
  const response = await request(server)
    .post(`${API}/auth/register`)
    .send({
      organizationName: `Equipo ${label} ${suffix}`,
      organizationSlug: slug,
      name: `Owner ${label}`,
      email,
      password: 'TurnoProDemo123!',
    })
    .expect(201);

  return {
    organizationId: response.body.organization.id as string,
    membershipId: response.body.membership.id as string,
    slug,
    email,
    accessToken: response.body.accessToken as string,
  };
}

async function login(email: string, organizationSlug: string): Promise<string> {
  const response = await request(server)
    .post(`${API}/auth/login`)
    .send({ email, password: 'TurnoProDemo123!', organizationSlug })
    .expect(200);

  return response.body.accessToken as string;
}

async function addMember(
  tenant: TenantFixture,
  label: string,
  role: 'ADMIN' | 'STAFF',
): Promise<MemberFixture> {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: tenant.email },
  });
  const email = `member-${label}-${suffix}@demo.local`;
  extraEmails.push(email);

  const user = await prisma.user.create({
    data: {
      email,
      name: `Miembro ${label}`,
      passwordHash: owner.passwordHash,
    },
  });

  const membership = await prisma.membership.create({
    data: {
      organizationId: tenant.organizationId,
      userId: user.id,
      role,
    },
  });

  return {
    userId: user.id,
    membershipId: membership.id,
    email,
    accessToken: await login(email, tenant.slug),
  };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app, app.get(AppConfigService));
  app.useLogger(false);
  await app.init();

  prisma = app.get(PrismaService);
  server = app.getHttpServer();

  tenantA = await registerTenant('a');
  tenantB = await registerTenant('b');
  adminMember = await addMember(tenantA, 'admin', 'ADMIN');
  staffMember = await addMember(tenantA, 'staff', 'STAFF');
}, 90_000);

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: [tenantA.organizationId, tenantB.organizationId] } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [tenantA.email, tenantB.email, ...extraEmails] } },
  });
  await app.close();
});

describe('API de miembros (e2e)', () => {
  it('lista los miembros de la organización', async () => {
    const response = await request(server)
      .get(`${API}/organizations/current/members`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        tenantA.membershipId,
        adminMember.membershipId,
        staffMember.membershipId,
      ]),
    );
    expect(response.body.total).toBe(3);
  });

  it('rechaza a STAFF y a un ADMIN que intenta tocar a un OWNER', async () => {
    await request(server)
      .patch(`${API}/organizations/current/members/${staffMember.membershipId}`)
      .set('Authorization', `Bearer ${staffMember.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(403);

    const forbidden = await request(server)
      .patch(`${API}/organizations/current/members/${tenantA.membershipId}`)
      .set('Authorization', `Bearer ${adminMember.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('cambia el rol y audita el cambio', async () => {
    const updated = await request(server)
      .patch(`${API}/organizations/current/members/${adminMember.membershipId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ role: 'MANAGER' })
      .expect(200);

    expect(updated.body.id).toBe(adminMember.membershipId);
    expect(updated.body.role).toBe('MANAGER');
    expect(updated.body.status).toBe('ACTIVE');

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: tenantA.organizationId,
        action: 'member.updated',
        entityId: adminMember.membershipId,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({
      from: { role: 'ADMIN', status: 'ACTIVE' },
      to: { role: 'MANAGER', status: 'ACTIVE' },
    });
  });

  it('suspende y reactiva a un miembro invalidando su sesión', async () => {
    const suspended = await request(server)
      .patch(`${API}/organizations/current/members/${staffMember.membershipId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);
    expect(suspended.body.status).toBe('SUSPENDED');

    const blocked = await request(server)
      .get(`${API}/organizations/current`)
      .set('Authorization', `Bearer ${staffMember.accessToken}`)
      .expect(401);
    expect(blocked.body.error.code).toBe('UNAUTHORIZED');

    await request(server)
      .patch(`${API}/organizations/current/members/${staffMember.membershipId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    await request(server)
      .get(`${API}/organizations/current`)
      .set('Authorization', `Bearer ${staffMember.accessToken}`)
      .expect(200);
  });

  it('no permite editarse a sí mismo', async () => {
    const response = await request(server)
      .patch(`${API}/organizations/current/members/${tenantA.membershipId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('aísla miembros de otras organizaciones', async () => {
    await request(server)
      .patch(`${API}/organizations/current/members/${tenantB.membershipId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ role: 'STAFF' })
      .expect(404);
  });

  it('valida el cuerpo de la actualización', async () => {
    await request(server)
      .patch(`${API}/organizations/current/members/${adminMember.membershipId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({})
      .expect(400);

    await request(server)
      .patch(`${API}/organizations/current/members/${adminMember.membershipId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'INVITED' })
      .expect(400);
  });
});
