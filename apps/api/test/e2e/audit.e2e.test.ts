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
  email: string;
  accessToken: string;
}

let app: INestApplication;
let prisma: PrismaService;
let server: Parameters<typeof request>[0];
let tenantA: TenantFixture;
let tenantB: TenantFixture;
let staffTenant: TenantFixture;

async function registerTenant(label: string): Promise<TenantFixture> {
  const email = `audit-${label}-${suffix}@demo.local`;
  const response = await request(server)
    .post(`${API}/auth/register`)
    .send({
      organizationName: `Auditoría ${label} ${suffix}`,
      organizationSlug: `audit-${label}-${suffix}`,
      name: `Owner ${label}`,
      email,
      password: 'TurnoProDemo123!',
    })
    .expect(201);

  return {
    organizationId: response.body.organization.id as string,
    membershipId: response.body.membership.id as string,
    email,
    accessToken: response.body.accessToken as string,
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
  staffTenant = await registerTenant('staff');
  await prisma.membership.update({
    where: { id: staffTenant.membershipId },
    data: { role: 'STAFF' },
  });

  for (const index of [1, 2, 3]) {
    await request(server)
      .post(`${API}/clients`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({
        name: `Cliente auditoría ${index}`,
        phone: `+52157${index}${suffix.slice(0, 6)}`,
      })
      .expect(201);
  }
}, 60_000);

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: {
      id: {
        in: [
          tenantA.organizationId,
          tenantB.organizationId,
          staffTenant.organizationId,
        ],
      },
    },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [tenantA.email, tenantB.email, staffTenant.email] } },
  });
  await app.close();
});

describe('API de auditoría (e2e)', () => {
  it('lista solo la actividad de la organización con actor', async () => {
    const response = await request(server)
      .get(`${API}/audit`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);

    expect(response.body.total).toBeGreaterThanOrEqual(4);
    expect(
      response.body.items.every(
        (item: { actor: { email: string } | null }) =>
          item.actor === null || item.actor.email === tenantA.email,
      ),
    ).toBe(true);

    const clientAudit = response.body.items.find(
      (item: { action: string }) => item.action === 'client.created',
    );
    expect(clientAudit.actor).toMatchObject({ email: tenantA.email });
    expect(clientAudit.entity).toBe('client');
    expect(typeof clientAudit.metadata).toBe('object');

    const other = await request(server)
      .get(`${API}/audit`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .expect(200);

    expect(other.body.total).toBe(1);
    expect(other.body.items[0].action).toBe('auth.register');
    expect(
      other.body.items.some(
        (item: { action: string }) => item.action === 'client.created',
      ),
    ).toBe(false);
  });

  it('filtra por entidad, acción y fecha, y pagina', async () => {
    const byEntity = await request(server)
      .get(`${API}/audit?entity=client`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);
    expect(byEntity.body.total).toBe(3);
    expect(
      byEntity.body.items.every(
        (item: { entity: string }) => item.entity === 'client',
      ),
    ).toBe(true);

    const byAction = await request(server)
      .get(`${API}/audit?action=client.created`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);
    expect(byAction.body.total).toBe(3);

    const page = await request(server)
      .get(`${API}/audit?page=2&pageSize=2`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.page).toBe(2);
    expect(page.body.totalPages).toBe(Math.ceil(page.body.total / 2));

    const from = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    const recent = await request(server)
      .get(`${API}/audit?from=${encodeURIComponent(from)}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);
    expect(recent.body.total).toBeGreaterThanOrEqual(4);

    const future = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const empty = await request(server)
      .get(`${API}/audit?from=${encodeURIComponent(future)}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);
    expect(empty.body.total).toBe(0);
  });

  it('rechaza rangos inválidos y a STAFF', async () => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() - 60 * 60 * 1_000).toISOString();

    await request(server)
      .get(`${API}/audit?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(400);

    const forbidden = await request(server)
      .get(`${API}/audit`)
      .set('Authorization', `Bearer ${staffTenant.accessToken}`)
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });
});
