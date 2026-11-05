import { Injectable } from '@nestjs/common';
import { Prisma, type Appointment as AppointmentRecord } from '@turnopro/database';
import type {
  Appointment,
  AppointmentStatus,
  PaginatedResponse,
} from '@turnopro/contracts';
import { canTransitionAppointment } from '@turnopro/contracts';
import { AppError, ErrorCode, type RequestMetadata } from '@turnopro/shared';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { AppointmentsQueryDto } from './dto/appointments-query.dto';
import type { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import type { CreateAppointmentDto } from './dto/create-appointment.dto';
import type { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: 'pendiente',
  CONFIRMED: 'confirmado',
  COMPLETED: 'completado',
  CANCELLED: 'cancelado',
  NO_SHOW: 'inasistencia',
};

const MAX_TRANSACTION_ATTEMPTS = 3;
const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{1,128}$/;

const appointmentInclude = {
  client: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  service: {
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceCents: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

interface CreateOutcome {
  appointment: AppointmentWithRelations;
  replayed: boolean;
}

interface NormalizedBookingInput {
  clientId: string;
  employeeId: string;
  serviceId: string;
  startAt: Date;
  notes: string | null;
  idempotencyKey: string | null;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    organizationId: string,
    query: AppointmentsQueryDto,
  ): Promise<PaginatedResponse<Appointment>> {
    const { page, pageSize } = query;

    if (query.from && query.to && new Date(query.from) >= new Date(query.to)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'El rango de fechas no es válido',
        { field: 'from' },
      );
    }

    const where: Prisma.AppointmentWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.from || query.to
        ? {
            startAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, appointments] = await this.prisma.$transaction([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: appointments.map(mapAppointment),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getById(organizationId: string, appointmentId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId },
      include: appointmentInclude,
    });

    if (!appointment) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El turno no existe en esta organización',
      );
    }

    return mapAppointment(appointment);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateAppointmentDto,
    rawIdempotencyKey: string | undefined,
    meta: RequestMetadata,
  ): Promise<Appointment> {
    const input = normalizeInput(dto, rawIdempotencyKey);
    const outcome = await this.createWithRetry(organizationId, input);

    if (!outcome.replayed) {
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'appointment.created',
        entity: 'appointment',
        entityId: outcome.appointment.id,
        metadata: {
          employeeId: outcome.appointment.employeeId,
          clientId: outcome.appointment.clientId,
          serviceId: outcome.appointment.serviceId,
          startAt: outcome.appointment.startAt.toISOString(),
        },
        ...meta,
      });
    }

    return mapAppointment(outcome.appointment);
  }

  async updateStatus(
    organizationId: string,
    actorUserId: string,
    appointmentId: string,
    dto: UpdateAppointmentStatusDto,
    meta: RequestMetadata,
  ): Promise<Appointment> {
    const existing = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId },
    });

    if (!existing) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El turno no existe en esta organización',
      );
    }

    const from = existing.status as AppointmentStatus;

    // La cancelación conserva su flujo propio (motivo, cancelledAt y replay).
    if (dto.status === 'CANCELLED') {
      return this.cancel(
        organizationId,
        actorUserId,
        appointmentId,
        { reason: dto.reason },
        meta,
      );
    }

    if (from === dto.status) {
      return this.getById(organizationId, appointmentId);
    }

    if (!canTransitionAppointment(from, dto.status)) {
      throw new AppError(
        ErrorCode.CONFLICT,
        409,
        `No se puede pasar de ${STATUS_LABELS[from]} a ${STATUS_LABELS[dto.status]}`,
      );
    }

    if (
      (dto.status === 'COMPLETED' || dto.status === 'NO_SHOW') &&
      Date.now() < existing.startAt.getTime()
    ) {
      throw new AppError(
        ErrorCode.CONFLICT,
        409,
        'Solo puedes completar o marcar inasistencia cuando el turno ya comenzó',
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId, organizationId },
      data: { status: dto.status },
      include: appointmentInclude,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'appointment.status_changed',
      entity: 'appointment',
      entityId: appointmentId,
      metadata: { from, to: dto.status },
      ...meta,
    });

    return mapAppointment(updated);
  }

  async cancel(
    organizationId: string,
    actorUserId: string,
    appointmentId: string,
    dto: CancelAppointmentDto,
    meta: RequestMetadata,
  ): Promise<Appointment> {    const existing = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId },
    });

    if (!existing) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El turno no existe en esta organización',
      );
    }

    if (existing.status === 'CANCELLED') {
      const replay = await this.prisma.appointment.findFirstOrThrow({
        where: { id: appointmentId, organizationId },
        include: appointmentInclude,
      });
      return mapAppointment(replay);
    }

    if (existing.status === 'COMPLETED') {
      throw new AppError(
        ErrorCode.CONFLICT,
        409,
        'Un turno completado no se puede cancelar',
      );
    }

    const cancelled = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
      },
      include: appointmentInclude,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'appointment.cancelled',
      entity: 'appointment',
      entityId: appointmentId,
      metadata: { reason: dto.reason ?? null },
      ...meta,
    });

    return mapAppointment(cancelled);
  }

  private async createWithRetry(
    organizationId: string,
    input: NormalizedBookingInput,
  ): Promise<CreateOutcome> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.createInsideTransaction(tx, organizationId, input),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 15_000,
          },
        );
      } catch (error) {
        if (isSerializationFailure(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
          await delay(10 * attempt);
          continue;
        }

        if (isIdempotencyCollision(error)) {
          return this.resolveIdempotencyCollision(organizationId, input);
        }

        if (isExclusionViolation(error)) {
          throw new AppError(
            ErrorCode.BOOKING_SLOT_UNAVAILABLE,
            409,
            'El horario seleccionado ya no está disponible',
          );
        }

        if (isSerializationFailure(error)) {
          throw new AppError(
            ErrorCode.CONFLICT,
            409,
            'No se pudo completar la reserva por concurrencia; intenta de nuevo',
          );
        }

        throw error;
      }
    }

    throw new AppError(
      ErrorCode.CONFLICT,
      409,
      'No se pudo completar la reserva; intenta de nuevo',
    );
  }

  private async createInsideTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: NormalizedBookingInput,
  ): Promise<CreateOutcome> {
    if (input.idempotencyKey) {
      const replay = await tx.appointment.findFirst({
        where: {
          organizationId,
          idempotencyKey: input.idempotencyKey,
        },
        include: appointmentInclude,
      });

      if (replay) {
        ensureSameBooking(replay, input);
        return { appointment: replay, replayed: true };
      }
    }

    const [client, employee, service, link] = await Promise.all([
      tx.client.findFirst({
        where: { id: input.clientId, organizationId, status: 'ACTIVE' },
      }),
      tx.employee.findFirst({
        where: { id: input.employeeId, organizationId, status: 'ACTIVE' },
      }),
      tx.service.findFirst({
        where: { id: input.serviceId, organizationId, status: 'ACTIVE' },
      }),
      tx.employeeService.findFirst({
        where: {
          organizationId,
          employeeId: input.employeeId,
          serviceId: input.serviceId,
        },
      }),
    ]);

    if (!client) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El cliente no existe en esta organización',
        { field: 'clientId' },
      );
    }
    if (!employee) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El empleado no existe en esta organización',
        { field: 'employeeId' },
      );
    }
    if (!service) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El servicio no existe en esta organización',
        { field: 'serviceId' },
      );
    }
    if (!link) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'El empleado no ofrece el servicio seleccionado',
        { field: 'serviceId' },
      );
    }

    const endAt = new Date(input.startAt.getTime() + service.durationMinutes * 60_000);
    const blockedFromAt = new Date(
      input.startAt.getTime() - service.bufferBeforeMinutes * 60_000,
    );
    const blockedUntilAt = new Date(
      endAt.getTime() + service.bufferAfterMinutes * 60_000,
    );

    const timeOff = await tx.timeOff.findFirst({
      where: {
        organizationId,
        employeeId: input.employeeId,
        startsAt: { lt: blockedUntilAt },
        endsAt: { gt: blockedFromAt },
      },
      select: { id: true },
    });

    if (timeOff) {
      throw new AppError(
        ErrorCode.BOOKING_SLOT_UNAVAILABLE,
        409,
        'El empleado no está disponible en ese horario',
      );
    }

    const overlap = await tx.appointment.findFirst({
      where: {
        organizationId,
        employeeId: input.employeeId,
        status: { not: 'CANCELLED' },
        blockedFromAt: { lt: blockedUntilAt },
        blockedUntilAt: { gt: blockedFromAt },
      },
      select: { id: true },
    });

    if (overlap) {
      throw new AppError(
        ErrorCode.BOOKING_SLOT_UNAVAILABLE,
        409,
        'El horario seleccionado ya no está disponible',
      );
    }

    const appointment = await tx.appointment.create({
      data: {
        organizationId,
        clientId: input.clientId,
        employeeId: input.employeeId,
        serviceId: input.serviceId,
        startAt: input.startAt,
        endAt,
        blockedFromAt,
        blockedUntilAt,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes,
      },
      include: appointmentInclude,
    });

    return { appointment, replayed: false };
  }

  private async resolveIdempotencyCollision(
    organizationId: string,
    input: NormalizedBookingInput,
  ): Promise<CreateOutcome> {
    const existing = await this.prisma.appointment.findFirst({
      where: {
        organizationId,
        idempotencyKey: input.idempotencyKey ?? undefined,
      },
      include: appointmentInclude,
    });

    if (!existing) {
      throw new AppError(
        ErrorCode.IDEMPOTENCY_CONFLICT,
        409,
        'La clave de idempotencia ya fue utilizada',
      );
    }

    ensureSameBooking(existing, input);

    return { appointment: existing, replayed: true };
  }
}

function normalizeInput(
  dto: CreateAppointmentDto,
  rawIdempotencyKey: string | undefined,
): NormalizedBookingInput {
  const startAt = new Date(dto.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      'La fecha de inicio no es válida',
      { field: 'startAt' },
    );
  }

  if (startAt.getTime() <= Date.now()) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      'El turno debe comenzar en el futuro',
      { field: 'startAt' },
    );
  }

  const idempotencyKey = rawIdempotencyKey?.trim() || null;
  if (idempotencyKey && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      'La cabecera Idempotency-Key no es válida (1-128 caracteres alfanuméricos)',
      { field: 'Idempotency-Key' },
    );
  }

  return {
    clientId: dto.clientId,
    employeeId: dto.employeeId,
    serviceId: dto.serviceId,
    startAt,
    notes: dto.notes?.trim() || null,
    idempotencyKey,
  };
}

function ensureSameBooking(
  appointment: AppointmentRecord,
  input: NormalizedBookingInput,
): void {
  const same =
    appointment.clientId === input.clientId &&
    appointment.employeeId === input.employeeId &&
    appointment.serviceId === input.serviceId &&
    appointment.startAt.getTime() === input.startAt.getTime() &&
    (appointment.notes ?? null) === input.notes;

  if (!same) {
    throw new AppError(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      409,
      'La clave de idempotencia ya fue utilizada con otros datos',
    );
  }
}

function isIdempotencyCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.some((field) => field.includes('idempotencyKey'));
}

function isExclusionViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return (
    code === '23P01' ||
    error.message.includes('23P01') ||
    error.message.includes('appointments_employee_blocked_excl')
  );
}

function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return (
    code === '40001' ||
    code === '40P01' ||
    error.message.includes('40001') ||
    error.message.includes('40P01')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapAppointment(appointment: AppointmentWithRelations): Appointment {
  return {
    id: appointment.id,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    blockedFromAt: appointment.blockedFromAt.toISOString(),
    blockedUntilAt: appointment.blockedUntilAt.toISOString(),
    status: appointment.status as AppointmentStatus,
    notes: appointment.notes,
    idempotencyKey: appointment.idempotencyKey,
    cancelledAt: appointment.cancelledAt?.toISOString() ?? null,
    cancellationReason: appointment.cancellationReason,
    createdAt: appointment.createdAt.toISOString(),
    client: appointment.client,
    employee: appointment.employee,
    service: appointment.service,
  };
}
