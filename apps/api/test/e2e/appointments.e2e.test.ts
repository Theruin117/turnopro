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

function futureIso(offsetHours: number): string {
  return new Date(Date.now() + 48 * 60 * 60 * 1_000 + offsetHours * 60 * 60 * 1_000).toISOString();
}

async function registerTenant(label: string): Promise<TenantFixture> {
  const slug = `e2e-${label}-${suffix}`;
  const email = `owner-${label}-${suffix}@demo.local`;

  const response = await request(server)
    .post(`${API}/auth/register`)
    .send({
      organizationName: `Organización ${label} ${suffix}`,
      organizationSlug: slug,
      name: `Owner ${label}`,
      email,
      password: 'TurnoProDemo123!',
    })
    .expect(201);

  const organizationId = response.body.organization.id as string;
  const accessToken = response.body.accessToken as string;

  const service = await prisma.service.create({
    data: {
      organizationId,
      name: `Servicio ${label} ${suffix}`,
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
      priceCents: 25_000,
    },
  });

  const employee = await prisma.employee.create({
    data: {
      organizationId,
      name: `Empleado ${label} ${suffix}`,
      email: `empleado-${label}-${suffix}@demo.local`,
    },
  });

  await prisma.employeeService.create({
    data: { organizationId, employeeId: employee.id, serviceId: service.id },
  });

  const client = await prisma.client.create({
    data: {
      organizationId,
      name: `Cliente ${label} ${suffix}`,
      phone: `+52155${label.charCodeAt(0)}${suffix.slice(0, 6)}`,
    },
  });

  return {
    organizationId,
    email,
    accessToken,
    clientId: client.id,
    employeeId: employee.id,
    serviceId: service.id,
  };
}

function bookingBody(tenant: TenantFixture, startAt: string) {
  return {
    clientId: tenant.clientId,
    employeeId: tenant.employeeId,
    serviceId: tenant.serviceId,
    startAt,
    notes: 'Reserva de prueba',
  };
}

/** Crea un turno ya iniciado directamente en la base para probar estados. */
let pastAppointmentOffset = 2;
async function createPastAppointment(tenant: TenantFixture) {
  // Cada turno pasado usa una hora distinta para no chocar con la restricción
  // de exclusión del empleado.
  pastAppointmentOffset += 1;
  const startAt = new Date(
    Date.now() - pastAppointmentOffset * 60 * 60 * 1_000,
  );
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
      status: 'CONFIRMED',
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
}, 60_000);

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: [tenantA.organizationId, tenantB.organizationId] } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [tenantA.email, tenantB.email] } },
  });
  await app.close();
});

describe('API de turnos (e2e)', () => {
  it('crea, lista y cancela un turno de la organización activa', async () => {
    const startAt = futureIso(0);

    const created = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .set('Idempotency-Key', `create-${suffix}`)
      .send(bookingBody(tenantA, startAt))
      .expect(201);

    expect(created.body.status).toBe('PENDING');
    expect(created.body.organizationId).toBeUndefined();
    expect(created.body.employee.name).toContain('Empleado a');

    const list = await request(server)
      .get(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);

    expect(list.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(true);

    const cancelled = await request(server)
      .patch(`${API}/appointments/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ reason: 'Prueba e2e' })
      .expect(200);

    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('reintenta de forma idempotente con la misma clave', async () => {
    const startAt = futureIso(2);
    const key = `idem-${suffix}`;

    const first = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .set('Idempotency-Key', key)
      .send(bookingBody(tenantA, startAt))
      .expect(201);

    const second = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .set('Idempotency-Key', key)
      .send(bookingBody(tenantA, startAt))
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it('rechaza la misma clave con datos distintos', async () => {
    const key = `idem-conflict-${suffix}`;

    await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .set('Idempotency-Key', key)
      .send(bookingBody(tenantA, futureIso(4)))
      .expect(201);

    const response = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .set('Idempotency-Key', key)
      .send(bookingBody(tenantA, futureIso(5)))
      .expect(409);

    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('impide solapamientos y deja pasar solo una reserva concurrente', async () => {
    const startAt = futureIso(8);

    await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, startAt))
      .expect(201);

    const overlap = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, startAt))
      .expect(409);

    expect(overlap.body.error.code).toBe('BOOKING_SLOT_UNAVAILABLE');

    const concurrentStart = futureIso(20);
    const responses = await Promise.all([
      request(server)
        .post(`${API}/appointments`)
        .set('Authorization', `Bearer ${tenantA.accessToken}`)
        .send(bookingBody(tenantA, concurrentStart)),
      request(server)
        .post(`${API}/appointments`)
        .set('Authorization', `Bearer ${tenantA.accessToken}`)
        .send(bookingBody(tenantA, concurrentStart)),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('cambia el estado solo por transiciones válidas', async () => {
    const created = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, futureIso(40)))
      .expect(201);

    const invalidJump = await request(server)
      .patch(`${API}/appointments/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'COMPLETED' })
      .expect(409);
    expect(invalidJump.body.error.code).toBe('CONFLICT');

    const confirmed = await request(server)
      .patch(`${API}/appointments/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');

    // Confirmar dos veces es idempotente.
    await request(server)
      .patch(`${API}/appointments/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    // Un turno futuro todavía no se puede completar ni marcar como inasistencia.
    await request(server)
      .patch(`${API}/appointments/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'COMPLETED' })
      .expect(409);

    await request(server)
      .patch(`${API}/appointments/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'NO_SHOW' })
      .expect(409);

    const cancelled = await request(server)
      .patch(`${API}/appointments/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'CANCELLED', reason: 'Prueba de estado' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.cancelledAt).toBeTruthy();

    // Estado terminal: no se puede reabrir.
    await request(server)
      .patch(`${API}/appointments/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(409);
  });

  it('permite completar un turno ya iniciado y lo audita', async () => {
    const past = await createPastAppointment(tenantA);

    const completed = await request(server)
      .patch(`${API}/appointments/${past.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: tenantA.organizationId,
        entityId: past.id,
        action: 'appointment.status_changed',
      },
    });
    expect(audit).not.toBeNull();
  });

  it('aísla el cambio de estado entre organizaciones', async () => {
    const created = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, futureIso(44)))
      .expect(201);

    await request(server)
      .patch(`${API}/appointments/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(404);
  });

  it('reprograma un turno y respeta los solapamientos', async () => {
    const created = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, futureIso(46)))
      .expect(201);

    const target = futureIso(48);
    const rescheduled = await request(server)
      .patch(`${API}/appointments/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ startAt: target, notes: 'Reprogramado en e2e' })
      .expect(200);

    expect(rescheduled.body.id).toBe(created.body.id);
    expect(rescheduled.body.startAt).toBe(target);
    expect(rescheduled.body.notes).toBe('Reprogramado en e2e');
    expect(rescheduled.body.clientId).toBeUndefined();
    expect(rescheduled.body.client.id).toBe(tenantA.clientId);

    // Mover al mismo horario no choca consigo mismo.
    await request(server)
      .patch(`${API}/appointments/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ startAt: target })
      .expect(200);

    const other = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, futureIso(50)))
      .expect(201);

    const overlap = await request(server)
      .patch(`${API}/appointments/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ startAt: futureIso(50) })
      .expect(409);
    expect(overlap.body.error.code).toBe('BOOKING_SLOT_UNAVAILABLE');

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: tenantA.organizationId,
        entityId: created.body.id,
        action: 'appointment.rescheduled',
      },
    });
    expect(audit).not.toBeNull();
    expect(other.body.id).not.toBe(created.body.id);
  });

  it('solo permite reprogramar una vez por concurrencia', async () => {
    const first = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, futureIso(52)))
      .expect(201);

    const second = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, futureIso(54)))
      .expect(201);

    const target = futureIso(56);
    const responses = await Promise.all([
      request(server)
        .patch(`${API}/appointments/${first.body.id}/schedule`)
        .set('Authorization', `Bearer ${tenantA.accessToken}`)
        .send({ startAt: target }),
      request(server)
        .patch(`${API}/appointments/${second.body.id}/schedule`)
        .set('Authorization', `Bearer ${tenantA.accessToken}`)
        .send({ startAt: target }),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('no reprograma turnos terminales ni de otra organización', async () => {
    const past = await createPastAppointment(tenantA);

    await request(server)
      .patch(`${API}/appointments/${past.id}/status`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    await request(server)
      .patch(`${API}/appointments/${past.id}/schedule`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ startAt: futureIso(58) })
      .expect(409);

    const owned = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, futureIso(60)))
      .expect(201);

    await request(server)
      .patch(`${API}/appointments/${owned.body.id}/schedule`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ startAt: futureIso(62) })
      .expect(404);
  });

  it('aísla los turnos entre organizaciones', async () => {
    const created = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send(bookingBody(tenantA, futureIso(30)))
      .expect(201);

    const read = await request(server)
      .get(`${API}/appointments/${created.body.id}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .expect(404);
    expect(read.body.error.code).toBe('NOT_FOUND');

    await request(server)
      .patch(`${API}/appointments/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({})
      .expect(404);

    const crossTenantBooking = await request(server)
      .post(`${API}/appointments`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send(bookingBody(tenantA, futureIso(34)))
      .expect(404);
    expect(crossTenantBooking.body.error.code).toBe('NOT_FOUND');
  });
});
