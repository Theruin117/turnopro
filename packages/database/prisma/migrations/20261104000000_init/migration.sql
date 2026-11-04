-- TurnoPro — migración inicial
-- Generada manualmente a partir de prisma/schema.prisma.
-- Requiere PostgreSQL 14+.

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'STAFF');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE "ServiceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- ─────────────────────────────────────────────────────────────
-- Organizaciones y acceso
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(48) NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MXN',
    "locale" VARCHAR(12) NOT NULL DEFAULT 'es-MX',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organizations_name_check" CHECK (char_length(btrim("name")) > 0),
    CONSTRAINT "organizations_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_check" CHECK ("email" = lower("email"))
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'STAFF',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");
CREATE INDEX "memberships_userId_status_idx" ON "memberships"("userId", "status");
CREATE INDEX "memberships_organizationId_status_idx" ON "memberships"("organizationId", "status");

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedByTokenId" UUID,
    "lastUsedAt" TIMESTAMPTZ(3),
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "refresh_tokens_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "refresh_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "refresh_tokens_replacedByTokenId_fkey" FOREIGN KEY ("replacedByTokenId") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
CREATE INDEX "refresh_tokens_membershipId_idx" ON "refresh_tokens"("membershipId");
CREATE INDEX "refresh_tokens_organizationId_idx" ON "refresh_tokens"("organizationId");
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- ─────────────────────────────────────────────────────────────
-- Catálogo de servicios y equipo
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "status" "ServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "services_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "services_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "services_name_check" CHECK (char_length(btrim("name")) > 0),
    CONSTRAINT "services_duration_check" CHECK ("durationMinutes" > 0),
    CONSTRAINT "services_buffer_before_check" CHECK ("bufferBeforeMinutes" >= 0),
    CONSTRAINT "services_buffer_after_check" CHECK ("bufferAfterMinutes" >= 0),
    CONSTRAINT "services_price_check" CHECK ("priceCents" >= 0)
);

CREATE UNIQUE INDEX "services_organizationId_name_key" ON "services"("organizationId", "name");
CREATE INDEX "services_organizationId_status_idx" ON "services"("organizationId", "status");

CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "color" VARCHAR(9),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employees_name_check" CHECK (char_length(btrim("name")) > 0)
);

CREATE INDEX "employees_organizationId_status_idx" ON "employees"("organizationId", "status");
CREATE INDEX "employees_organizationId_email_idx" ON "employees"("organizationId", "email");

CREATE TABLE "employee_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_services_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_services_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_services_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "employee_services_employeeId_serviceId_key" ON "employee_services"("employeeId", "serviceId");
CREATE INDEX "employee_services_organizationId_idx" ON "employee_services"("organizationId");
CREATE INDEX "employee_services_serviceId_idx" ON "employee_services"("serviceId");

CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "availability_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "availability_rules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "availability_rules_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "availability_rules_minutes_check" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute")
);

CREATE UNIQUE INDEX "availability_rules_employeeId_weekday_startMinute_endMinute_key"
    ON "availability_rules"("employeeId", "weekday", "startMinute", "endMinute");
CREATE INDEX "availability_rules_organizationId_employeeId_weekday_idx"
    ON "availability_rules"("organizationId", "employeeId", "weekday");

CREATE TABLE "time_off" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "time_off_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "time_off_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "time_off_range_check" CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "time_off_organizationId_employeeId_idx" ON "time_off"("organizationId", "employeeId");
CREATE INDEX "time_off_employeeId_startsAt_endsAt_idx" ON "time_off"("employeeId", "startsAt", "endsAt");

-- ─────────────────────────────────────────────────────────────
-- Clientes y reservas
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "notes" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "clients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "clients_name_check" CHECK (char_length(btrim("name")) > 0)
);

CREATE UNIQUE INDEX "clients_organizationId_phone_key" ON "clients"("organizationId", "phone");
CREATE INDEX "clients_organizationId_status_idx" ON "clients"("organizationId", "status");
CREATE INDEX "clients_organizationId_name_idx" ON "clients"("organizationId", "name");
CREATE INDEX "clients_organizationId_email_idx" ON "clients"("organizationId", "email");

CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedFromAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntilAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" VARCHAR(128),
    "notes" TEXT,
    "createdByUserId" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "appointments_time_range_check" CHECK ("endAt" > "startAt"),
    CONSTRAINT "appointments_blocked_range_check" CHECK ("blockedUntilAt" > "blockedFromAt"),
    CONSTRAINT "appointments_blocked_contains_check" CHECK ("blockedFromAt" <= "startAt" AND "blockedUntilAt" >= "endAt")
);

CREATE UNIQUE INDEX "appointments_organizationId_idempotencyKey_key"
    ON "appointments"("organizationId", "idempotencyKey");
CREATE INDEX "appointments_organizationId_startAt_idx" ON "appointments"("organizationId", "startAt");
CREATE INDEX "appointments_organizationId_status_startAt_idx" ON "appointments"("organizationId", "status", "startAt");
CREATE INDEX "appointments_employeeId_startAt_endAt_idx" ON "appointments"("employeeId", "startAt", "endAt");
CREATE INDEX "appointments_clientId_startAt_idx" ON "appointments"("clientId", "startAt");
CREATE INDEX "appointments_serviceId_idx" ON "appointments"("serviceId");

-- Defensa a nivel de base de datos contra dobles reservas.
-- Un empleado no puede tener dos turnos activos cuyos rangos bloqueados se solapen.
ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_employee_blocked_excl"
    EXCLUDE USING gist (
        "employeeId" WITH =,
        tstzrange("blockedFromAt", "blockedUntilAt", '[)') WITH &&
    )
    WHERE ("status" <> 'CANCELLED');

-- ─────────────────────────────────────────────────────────────
-- Auditoría y eventos de integración
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(64),
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");
CREATE INDEX "outbox_events_organizationId_type_idx" ON "outbox_events"("organizationId", "type");
