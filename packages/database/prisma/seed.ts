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

  await prisma.client.upsert({
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

  console.log('✓ Seed local listo');
  console.log(`  Organización: ${organizationName} (${slug})`);
  console.log(`  Usuario:      ${ownerEmail}`);
  console.log(`  Contraseña:   ${ownerPassword}`);
  console.log(`  Empleado:     ${employee.id}`);
  console.log(`  Servicio:     ${service.id}`);
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
