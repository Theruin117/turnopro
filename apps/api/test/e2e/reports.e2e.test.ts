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
const DAY_MS = 24 * 60 * 60 * 1_000;

interface TenantFixture {
  organizationId: string;
  membershipId: string;
  email: string;
  accessToken: string;
  clientId: string;
  employeeId: string;
  serviceId: string;
}

let app: INestApplication;
let prisma: PrismaService;
let server: Parameters<typeof request>[0];
let tenantA: TenantFixture;
let tenantB: TenantFixture;
let staffTenant: TenantFixture;

async function registerTenant(label: string): Promise<TenantFixture> {
  const slug = `reports-${label}-${suffix}`;
  const email = `reports-${label}-${suffix}@demo.local`;

  const response = await request(server)
    .post(`${API}/auth/register`)
    .send({
      organizationName: `Reportes ${label} ${suffix}`,
      organizationSlug: slug,
      name: `Owner ${label}`,
      email,
      password: 'TurnoProDemo123!',
    })
    .expect(201);

  const organizationId = response.body.organization.id as string;
  const membershipId = response.body.membership.id as string;
  const accessToken = response.body.accessToken as string;

  const service = await prisma.service.create({
    data: {
      organizationId,
      name: `Servicio reportes ${label} ${suffix}`,
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
      priceCents: 25_000,
    },
  });

  const employee = await prisma.employee.create({
    data: {
      organizationId,
      name: `Empleado reportes ${label} ${suffix}`,
      email: `empleado-reports-${label}-${suffix}@demo.local`,
    },
  });

  await prisma.employeeService.create({
    data: { organizationId, employeeId: employee.id, serviceId: service.id },
  });

  const client = await prisma.client.create({
    data: {
      organizationId,
      name: `Cliente reportes ${label} ${suffix}`,
      phone: `+52156${label.charCodeAt(0)}${suffix.slice(0, 6)}`,
    },
  });

  return {
    organizationId,
    membershipId,
    email,
    accessToken,
    clientId: client.id,
    employeeId: employee.id,
    serviceId: service.id,
  };
}

async function createAppointment(
  tenant: TenantFixture,
  daysAgo: number,
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
  hourUtc = 10,
) {
  const startAt = new Date(Date.now() - daysAgo * DAY_MS);
  startAt.setUTCHours(hourUtc, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + 30 * 60 * 1_000);

  return prisma.appointment.create({
    data: {
      organizationId: tenant.organizationId,
      clientId: tenant.clientId,
      employeeId: tenant.employeeId,
      serviceId: tenant.serviceId,
      startAt,
      endAt,
      blockedFromAt: new Date(startAt.getTime() - 5 * 60 * 1_000),
      blockedUntilAt: new Date(endAt.getTime() + 5 * 60 * 1_000),
      status,
      cancelledAt: status === 'CANCELLED' ? new Date() : null,
    },
  });
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

  // El guard revalida el rol contra la base: el token sigue sirviendo, pero
  // pasa a ser STAFF para probar el 403.
  await prisma.membership.update({
    where: { id: staffTenant.membershipId },
    data: { role: 'STAFF' },
  });
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
    where: {
      email: {
        in: [tenantA.email, tenantB.email, staffTenant.email],
      },
    },
  });
  await app.close();
});

describe('API de reportes (e2e)', () => {
  it('calcula totales del rango y aísla por organización', async () => {
    await createAppointment(tenantA, 5, 'COMPLETED');
    await createAppointment(tenantA, 6, 'CANCELLED');
    await createAppointment(tenantA, 7, 'NO_SHOW');
    await createAppointment(tenantA, 2, 'CONFIRMED');
    await createAppointment(tenantB, 3, 'COMPLETED');

    const summary = await request(server)
      .get(`${API}/reports/summary`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);

    expect(summary.body.totals).toEqual({
      appointments: 4,
      pending: 0,
      confirmed: 1,
      completed: 1,
      cancelled: 1,
      noShow: 1,
      revenueCents: 25_000,
      cancellationRate: 0.25,
      noShowRate: 0.25,
    });
    expect(summary.body.byEmployee).toHaveLength(1);
    expect(summary.body.byEmployee[0]).toMatchObject({
      employeeId: tenantA.employeeId,
      appointments: 4,
      completed: 1,
      bookedMinutes: 90,
      revenueCents: 25_000,
    });
    expect(summary.body.byDay).toHaveLength(4);
    expect(summary.body.range.from < summary.body.range.to).toBe(true);

    const other = await request(server)
      .get(`${API}/reports/summary`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .expect(200);

    expect(other.body.totals.appointments).toBe(1);
    expect(other.body.totals.cancelled).toBe(0);
    expect(other.body.byEmployee[0].employeeId).toBe(tenantB.employeeId);
  });

  it('respeta el rango solicitado y rechaza rangos inválidos', async () => {
    const from = new Date(Date.now() - 4 * DAY_MS).toISOString();
    const to = new Date().toISOString();

    const filtered = await request(server)
      .get(`${API}/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);

    expect(filtered.body.totals.appointments).toBe(1);
    expect(filtered.body.totals.confirmed).toBe(1);

    await request(server)
      .get(
        `${API}/reports/summary?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`,
      )
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(400);

    const tooLongFrom = new Date(Date.now() - 400 * DAY_MS).toISOString();
    await request(server)
      .get(
        `${API}/reports/summary?from=${encodeURIComponent(tooLongFrom)}&to=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(400);
  });

  it('rechaza a STAFF', async () => {
    const response = await request(server)
      .get(`${API}/reports/summary`)
      .set('Authorization', `Bearer ${staffTenant.accessToken}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});
