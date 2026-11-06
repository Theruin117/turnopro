/**
 * Seed exclusivamente local con datos ficticios.
 * No ejecutar contra producción.
 */
import { hash, Algorithm } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

const DEMO_TIMEZONE = 'America/Mexico_City';

function formatDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24,
    value('minute'),
    value('second'),
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(dateKey: string, minutesFromMidnight: number, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const utcGuess = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutesFromMidnight / 60),
    minutesFromMidnight % 60,
  );
  return new Date(utcGuess - timeZoneOffsetMs(new Date(utcGuess), timeZone));
}

function dateKeyWeekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Avanza o retrocede días hábiles (lun–vie) desde una fecha. */
function businessDayOffset(baseDateKey: string, offset: number): string {
  let dateKey = baseDateKey;
  let remaining = Math.abs(offset);
  const step = offset < 0 ? -1 : 1;

  while (remaining > 0) {
    dateKey = addDaysToDateKey(dateKey, step);
    const weekday = dateKeyWeekday(dateKey);
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }

  return dateKey;
}

type DemoAppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

interface DemoAppointment {
  key: string;
  /** Días hábiles respecto a hoy: negativo = pasado. */
  offset: number;
  /** Minutos desde medianoche en la zona de la organización. */
  startMinute: number;
  status: DemoAppointmentStatus;
  notes: string;
}

const DEMO_APPOINTMENTS: DemoAppointment[] = [
  {
    key: 'seed-demo-01',
    offset: 1,
    startMinute: 10 * 60,
    status: 'CONFIRMED',
    notes: 'Turno confirmado de demostración.',
  },
  {
    key: 'seed-demo-02',
    offset: 2,
    startMinute: 11 * 60,
    status: 'PENDING',
    notes: 'Turno pendiente de confirmar (demo).',
  },
  {
    key: 'seed-demo-03',
    offset: 5,
    startMinute: 16 * 60,
    status: 'CONFIRMED',
    notes: 'Turno confirmado de la próxima semana (demo).',
  },
  {
    key: 'seed-demo-04',
    offset: -2,
    startMinute: 9 * 60,
    status: 'COMPLETED',
    notes: 'Turno completado (demo).',
  },
  {
    key: 'seed-demo-05',
    offset: -3,
    startMinute: 12 * 60,
    status: 'NO_SHOW',
    notes: 'El cliente no se presentó (demo).',
  },
  {
    key: 'seed-demo-06',
    offset: -4,
    startMinute: 15 * 60,
    status: 'CANCELLED',
    notes: 'Turno cancelado por el cliente (demo).',
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed de demostración está prohibido en producción.');
  }

  const slug = process.env.SEED_ORG_SLUG ?? 'demo';
  const organizationName = process.env.SEED_ORG_NAME ?? 'TurnoPro Demo';
  const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? 'owner@demo.turnopro.local').toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'TurnoProDemo123!';
  const ownerName = process.env.SEED_OWNER_NAME ?? 'Propietario Demo';

  const organization = await prisma.organization.upsert({
    where: { slug },
    update: { name: organizationName },
    create: {
      name: organizationName,
      slug,
      timezone: 'America/Mexico_City',
      currency: 'MXN',
    },
  });

  const passwordHash = await hash(ownerPassword, ARGON2_OPTIONS);

  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { name: ownerName },
    create: {
      email: ownerEmail,
      name: ownerName,
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: { role: 'OWNER', status: 'ACTIVE' },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  // Catálogo mínimo para probar el motor de reservas sin datos reales.
  const service = await prisma.service.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Consulta general',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      organizationId: organization.id,
      name: 'Consulta general',
      description: 'Servicio ficticio de demostración (30 minutos).',
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
      priceCents: 50_000,
    },
  });

  const employeeEmail = 'ana.demo@turnopro.local';
  const existingEmployee = await prisma.employee.findFirst({
    where: { organizationId: organization.id, email: employeeEmail },
  });
  const employee = existingEmployee
    ? await prisma.employee.update({
        where: { id: existingEmployee.id },
        data: { name: 'Ana López (demo)', status: 'ACTIVE' },
      })
    : await prisma.employee.create({
        data: {
          organizationId: organization.id,
          name: 'Ana López (demo)',
          email: employeeEmail,
          color: '#2563eb',
        },
      });

  await prisma.employeeService.upsert({
    where: {
      employeeId_serviceId: {
        employeeId: employee.id,
        serviceId: service.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      employeeId: employee.id,
      serviceId: service.id,
    },
  });

  for (let weekday = 1; weekday <= 5; weekday += 1) {
    await prisma.availabilityRule.upsert({
      where: {
        employeeId_weekday_startMinute_endMinute: {
          employeeId: employee.id,
          weekday,
          startMinute: 540,
          endMinute: 1_080,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        employeeId: employee.id,
        weekday,
        startMinute: 540,
        endMinute: 1_080,
      },
    });
  }

  const client = await prisma.client.upsert({
    where: {
      organizationId_phone: {
        organizationId: organization.id,
        phone: '+5215555550100',
      },
    },
    update: { name: 'Cliente Demo', status: 'ACTIVE' },
    create: {
      organizationId: organization.id,
      name: 'Cliente Demo',
      email: 'cliente.demo@turnopro.local',
      phone: '+5215555550100',
      notes: 'Cliente ficticio para pruebas locales.',
    },
  });

  // Turnos de demostración: idempotentes por `idempotencyKey`, con los buffers
  // del servicio ya aplicados en el rango bloqueado. Las horas no se solapan
  // para respetar la restricción de exclusión de PostgreSQL.
  const today = formatDateKey(new Date(), DEMO_TIMEZONE);

  for (const demo of DEMO_APPOINTMENTS) {
    const dateKey = businessDayOffset(today, demo.offset);
    const startAt = zonedDateTimeToUtc(dateKey, demo.startMinute, DEMO_TIMEZONE);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    const blockedFromAt = new Date(
      startAt.getTime() - service.bufferBeforeMinutes * 60_000,
    );
    const blockedUntilAt = new Date(
      endAt.getTime() + service.bufferAfterMinutes * 60_000,
    );
    const cancelled = demo.status === 'CANCELLED';

    const data = {
      clientId: client.id,
      employeeId: employee.id,
      serviceId: service.id,
      startAt,
      endAt,
      blockedFromAt,
      blockedUntilAt,
      status: demo.status,
      notes: demo.notes,
      createdByUserId: user.id,
      cancelledAt: cancelled ? new Date(startAt.getTime() - 24 * 60 * 60 * 1_000) : null,
      cancellationReason: cancelled ? 'Cancelado por el cliente (demo).' : null,
    };

    await prisma.appointment.upsert({
      where: {
        organizationId_idempotencyKey: {
          organizationId: organization.id,
          idempotencyKey: demo.key,
        },
      },
      update: data,
      create: {
        organizationId: organization.id,
        idempotencyKey: demo.key,
        ...data,
      },
    });
  }

  const demoAppointments = await prisma.appointment.count({
    where: { organizationId: organization.id },
  });

  console.log('✓ Seed local listo');
  console.log(`  Organización: ${organizationName} (${slug})`);
  console.log(`  Usuario:      ${ownerEmail}`);
  console.log(`  Contraseña:   ${ownerPassword}`);
  console.log(`  Empleado:     ${employee.id}`);
  console.log(`  Servicio:     ${service.id}`);
  console.log(`  Turnos demo:  ${demoAppointments}`);
  console.log('  Estos datos son ficticios y solo existen en desarrollo.');
}

main()
  .catch((error: unknown) => {
    console.error('✗ Seed falló:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
