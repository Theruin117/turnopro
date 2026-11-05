import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addDaysToDateKey,
  dateKeyWeekday,
  todayInTimeZone,
  zonedDateTimeToUtc,
} from '@turnopro/shared';

import { AppModule } from '../../src/app.module';
import { AppConfigService } from '../../src/config/app-config.service';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

const API = '/api/v1';
const suffix = randomUUID().slice(0, 8);

interface TenantFixture {
  organizationId: string;
  email: string;
  accessToken: string;
  timezone: string;
}

interface CatalogFixture {
  serviceId: string;
  employeeId: string;
  clientId: string;
}

let app: INestApplication;
let prisma: PrismaService;
let server: Parameters<typeof request>[0];
let tenant: TenantFixture;
let otherTenant: TenantFixture;
let catalog: CatalogFixture;
let selectedDate: string;

async function registerTenant(label: string): Promise<TenantFixture> {
  const email = `catalog-owner-${label}-${suffix}@demo.local`;
  const response = await request(server)
    .post(`${API}/auth/register`)
    .send({
      organizationName: `Catálogo ${label} ${suffix}`,
      organizationSlug: `catalog-${label}-${suffix}`,
      name: `Owner ${label}`,
      email,
      password: 'TurnoProDemo123!',
    })
    .expect(201);

  return {
    organizationId: response.body.organization.id as string,
    email,
    accessToken: response.body.accessToken as string,
    timezone: response.body.organization.timezone as string,
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

  tenant = await registerTenant('a');
  otherTenant = await registerTenant('b');

  const service = await request(server)
    .post(`${API}/services`)
    .set('Authorization', `Bearer ${tenant.accessToken}`)
    .send({
      name: `Consulta ${suffix}`,
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
      priceCents: 45_000,
    })
    .expect(201);

  const employee = await request(server)
    .post(`${API}/employees`)
    .set('Authorization', `Bearer ${tenant.accessToken}`)
    .send({
      name: `Empleada ${suffix}`,
      email: `empleada-${suffix}@demo.local`,
      serviceIds: [service.body.id],
    })
    .expect(201);

  const client = await request(server)
    .post(`${API}/clients`)
    .set('Authorization', `Bearer ${tenant.accessToken}`)
    .send({
      name: `Cliente ${suffix}`,
      phone: `+52155${suffix.replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`,
    })
    .expect(201);

  catalog = {
    serviceId: service.body.id as string,
    employeeId: employee.body.id as string,
    clientId: client.body.id as string,
  };

  selectedDate = addDaysToDateKey(todayInTimeZone(tenant.timezone), 7);
  const weekday = dateKeyWeekday(selectedDate);

  await request(server)
    .put(`${API}/availability/employees/${catalog.employeeId}/rules`)
    .set('Authorization', `Bearer ${tenant.accessToken}`)
    .send({
      rules: [{ weekday, startMinute: 9 * 60, endMinute: 18 * 60 }],
    })
    .expect(200);
}, 90_000);

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: [tenant.organizationId, otherTenant.organizationId] } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [tenant.email, otherTenant.email] } },
  });
  await app.close();
});

describe('Catálogo y disponibilidad (e2e)', () => {
  it('calcula slots reales y los bloquea al reservar', async () => {
    const slotsResponse = await request(server)
      .get(`${API}/availability/slots`)
      .query({
        employeeId: catalog.employeeId,
        serviceId: catalog.serviceId,
        date: selectedDate,
      })
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(200);

    expect(slotsResponse.body.timezone).toBe(tenant.timezone);
    expect(slotsResponse.body.durationMinutes).toBe(30);
    expect(slotsResponse.body.slots.length).toBeGreaterThan(0);

    const expectedFirstStart = zonedDateTimeToUtc(
      selectedDate,
      9 * 60,
      tenant.timezone,
    ).toISOString();
    expect(slotsResponse.body.slots[0].startAt).toBe(expectedFirstStart);

    await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .set('Idempotency-Key', `agenda-${suffix}`)
      .send({
        clientId: catalog.clientId,
        employeeId: catalog.employeeId,
        serviceId: catalog.serviceId,
        startAt: expectedFirstStart,
      })
      .expect(201);

    const afterBooking = await request(server)
      .get(`${API}/availability/slots`)
      .query({
        employeeId: catalog.employeeId,
        serviceId: catalog.serviceId,
        date: selectedDate,
      })
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(200);

    const starts = afterBooking.body.slots.map(
      (slot: { startAt: string }) => slot.startAt,
    );
    expect(starts).not.toContain(expectedFirstStart);
    expect(starts.length).toBeLessThan(slotsResponse.body.slots.length);
  });

  it('pagina el catálogo y valida los DTOs de entrada', async () => {
    const page = await request(server)
      .get(`${API}/services`)
      .query({ page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(200);

    expect(page.body.page).toBe(1);
    expect(page.body.pageSize).toBe(1);
    expect(page.body.items.length).toBeLessThanOrEqual(1);

    await request(server)
      .get(`${API}/services`)
      .query({ unknown: 'x' })
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(400);

    await request(server)
      .post(`${API}/services`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ name: 'Inválido', durationMinutes: 0 })
      .expect(400);
  });

  it('bloquea y libera slots con time_off', async () => {
    const timeOffStart = zonedDateTimeToUtc(selectedDate, 10 * 60, tenant.timezone);
    const timeOffEnd = zonedDateTimeToUtc(selectedDate, 11 * 60, tenant.timezone);

    const timeOff = await request(server)
      .post(`${API}/availability/employees/${catalog.employeeId}/time-off`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        startsAt: timeOffStart.toISOString(),
        endsAt: timeOffEnd.toISOString(),
        reason: 'Bloqueo e2e',
      })
      .expect(201);

    const blockedSlots = await request(server)
      .get(`${API}/availability/slots`)
      .query({
        employeeId: catalog.employeeId,
        serviceId: catalog.serviceId,
        date: selectedDate,
      })
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(200);

    const blockedStarts = blockedSlots.body.slots.map(
      (slot: { startAt: string }) => slot.startAt,
    );
    expect(blockedStarts).not.toContain(timeOffStart.toISOString());

    await request(server)
      .delete(`${API}/availability/time-off/${timeOff.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(204);

    const releasedSlots = await request(server)
      .get(`${API}/availability/slots`)
      .query({
        employeeId: catalog.employeeId,
        serviceId: catalog.serviceId,
        date: selectedDate,
      })
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(200);

    const releasedStarts = releasedSlots.body.slots.map(
      (slot: { startAt: string }) => slot.startAt,
    );
    expect(releasedStarts).toContain(timeOffStart.toISOString());
  });

  it('aísla catálogo, reglas y slots entre organizaciones', async () => {
    await request(server)
      .get(`${API}/services/${catalog.serviceId}`)
      .set('Authorization', `Bearer ${otherTenant.accessToken}`)
      .expect(404);

    await request(server)
      .get(`${API}/employees/${catalog.employeeId}`)
      .set('Authorization', `Bearer ${otherTenant.accessToken}`)
      .expect(404);

    await request(server)
      .get(`${API}/clients/${catalog.clientId}`)
      .set('Authorization', `Bearer ${otherTenant.accessToken}`)
      .expect(404);

    await request(server)
      .get(`${API}/availability/employees/${catalog.employeeId}/rules`)
      .set('Authorization', `Bearer ${otherTenant.accessToken}`)
      .expect(404);

    await request(server)
      .get(`${API}/availability/slots`)
      .query({
        employeeId: catalog.employeeId,
        serviceId: catalog.serviceId,
        date: selectedDate,
      })
      .set('Authorization', `Bearer ${otherTenant.accessToken}`)
      .expect(404);
  });

  it('actualiza y archiva servicios, empleados y clientes', async () => {
    const updatedService = await request(server)
      .patch(`${API}/services/${catalog.serviceId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ durationMinutes: 45, priceCents: 55_000 })
      .expect(200);
    expect(updatedService.body.durationMinutes).toBe(45);

    const updatedEmployee = await request(server)
      .patch(`${API}/employees/${catalog.employeeId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ phone: '+5215555550199', serviceIds: [] })
      .expect(200);
    expect(updatedEmployee.body.services).toEqual([]);

    const updatedClient = await request(server)
      .patch(`${API}/clients/${catalog.clientId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ notes: 'Cliente actualizado en e2e' })
      .expect(200);
    expect(updatedClient.body.notes).toContain('e2e');

    const archivedClient = await request(server)
      .delete(`${API}/clients/${catalog.clientId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .expect(200);
    expect(archivedClient.body.status).toBe('ARCHIVED');
  });
});
