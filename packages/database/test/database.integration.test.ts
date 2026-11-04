import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Pruebas de integración contra PostgreSQL real.
 * Verifican las garantías que no se pueden comprobar con mocks:
 * exclusión de solapamientos, idempotencia y aislamiento por organización.
 *
 * Requieren DATABASE_URL apuntando a una base de desarrollo/pruebas.
 * No usan datos reales: todo se genera con identificadores aleatorios.
 */
const prisma = new PrismaClient();
const suffix = randomUUID().slice(0, 8);

let organizationA: { id: string };
let organizationB: { id: string };
let serviceA: { id: string };
let employeeA: { id: string };
let clientA: { id: string };

const DAY = 24 * 60 * 60 * 1_000;
const baseStart = Date.now() + 7 * DAY;

beforeAll(async () => {
  organizationA = await prisma.organization.create({
    data: { name: `Org A ${suffix}`, slug: `org-a-${suffix}` },
  });
  organizationB = await prisma.organization.create({
    data: { name: `Org B ${suffix}`, slug: `org-b-${suffix}` },
  });

  serviceA = await prisma.service.create({
    data: {
      organizationId: organizationA.id,
      name: `Servicio ${suffix}`,
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceCents: 10_000,
    },
  });

  employeeA = await prisma.employee.create({
    data: {
      organizationId: organizationA.id,
      name: `Empleado ${suffix}`,
      email: `empleado-${suffix}@demo.local`,
    },
  });

  await prisma.employeeService.create({
    data: {
      organizationId: organizationA.id,
      employeeId: employeeA.id,
      serviceId: serviceA.id,
    },
  });

  clientA = await prisma.client.create({
    data: {
      organizationId: organizationA.id,
      name: `Cliente A ${suffix}`,
      phone: `+52155${suffix.replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`,
    },
  });
});

beforeEach(async () => {
  await prisma.appointment.deleteMany({
    where: { organizationId: { in: [organizationA.id, organizationB.id] } },
  });
});

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: [organizationA.id, organizationB.id] } },
  });
  await prisma.$disconnect();
});

function appointmentData(input: {
  organizationId: string;
  clientId: string;
  employeeId: string;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  idempotencyKey?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}) {
  return {
    organizationId: input.organizationId,
    clientId: input.clientId,
    employeeId: input.employeeId,
    serviceId: input.serviceId,
    startAt: input.startAt,
    endAt: input.endAt,
    blockedFromAt: input.startAt,
    blockedUntilAt: input.endAt,
    idempotencyKey: input.idempotencyKey,
    status: input.status ?? 'PENDING',
  };
}

describe('motor de reservas (PostgreSQL)', () => {
  it('rechaza un solapamiento exacto del mismo empleado', async () => {
    const startAt = new Date(baseStart);
    const endAt = new Date(baseStart + 60 * 60 * 1_000);

    await prisma.appointment.create({
      data: appointmentData({
        organizationId: organizationA.id,
        clientId: clientA.id,
        employeeId: employeeA.id,
        serviceId: serviceA.id,
        startAt,
        endAt,
      }),
    });

    await expect(
      prisma.appointment.create({
        data: appointmentData({
          organizationId: organizationA.id,
          clientId: clientA.id,
          employeeId: employeeA.id,
          serviceId: serviceA.id,
          startAt: new Date(baseStart + 30 * 60 * 1_000),
          endAt: new Date(baseStart + 90 * 60 * 1_000),
        }),
      }),
    ).rejects.toThrow(/23P01|exclusion|appointments_employee_blocked_excl/i);
  });

  it('permite solo una de dos reservas concurrentes en el mismo horario', async () => {
    const startAt = new Date(baseStart + 3 * 60 * 60 * 1_000);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1_000);

    const results = await Promise.allSettled([
      prisma.appointment.create({
        data: appointmentData({
          organizationId: organizationA.id,
          clientId: clientA.id,
          employeeId: employeeA.id,
          serviceId: serviceA.id,
          startAt,
          endAt,
        }),
      }),
      prisma.appointment.create({
        data: appointmentData({
          organizationId: organizationA.id,
          clientId: clientA.id,
          employeeId: employeeA.id,
          serviceId: serviceA.id,
          startAt,
          endAt,
        }),
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('impide reutilizar la misma clave de idempotencia en la organización', async () => {
    const key = `idem-${suffix}`;
    const startAt = new Date(baseStart + 6 * 60 * 60 * 1_000);

    await prisma.appointment.create({
      data: appointmentData({
        organizationId: organizationA.id,
        clientId: clientA.id,
        employeeId: employeeA.id,
        serviceId: serviceA.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1_000),
        idempotencyKey: key,
      }),
    });

    await expect(
      prisma.appointment.create({
        data: appointmentData({
          organizationId: organizationA.id,
          clientId: clientA.id,
          employeeId: employeeA.id,
          serviceId: serviceA.id,
          startAt: new Date(startAt.getTime() + 60 * 60 * 1_000),
          endAt: new Date(startAt.getTime() + 90 * 60 * 1_000),
          idempotencyKey: key,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('libera el horario cuando el turno se cancela', async () => {
    const startAt = new Date(baseStart + 9 * 60 * 60 * 1_000);

    const appointment = await prisma.appointment.create({
      data: appointmentData({
        organizationId: organizationA.id,
        clientId: clientA.id,
        employeeId: employeeA.id,
        serviceId: serviceA.id,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1_000),
      }),
    });

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    const replacement = await prisma.appointment.create({
      data: appointmentData({
        organizationId: organizationA.id,
        clientId: clientA.id,
        employeeId: employeeA.id,
        serviceId: serviceA.id,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1_000),
      }),
    });

    expect(replacement.status).toBe('PENDING');
  });

  it('no expone turnos entre organizaciones', async () => {
    const startAt = new Date(baseStart + 12 * 60 * 60 * 1_000);

    await prisma.appointment.create({
      data: appointmentData({
        organizationId: organizationA.id,
        clientId: clientA.id,
        employeeId: employeeA.id,
        serviceId: serviceA.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1_000),
      }),
    });

    const leaked = await prisma.appointment.findFirst({
      where: {
        organizationId: organizationB.id,
        employeeId: employeeA.id,
      },
    });

    expect(leaked).toBeNull();
  });
});
