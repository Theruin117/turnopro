import { Injectable } from '@nestjs/common';
import type {
  AvailabilityRule as AvailabilityRuleRecord,
  TimeOff as TimeOffRecord,
} from '@turnopro/database';
import type {
  AvailabilityRule,
  AvailabilitySlotsResponse,
  TimeOff,
} from '@turnopro/contracts';
import {
  AppError,
  ErrorCode,
  dateKeyWeekday,
  zonedDateTimeToUtc,
  type RequestMetadata,
} from '@turnopro/shared';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  AvailabilitySlotsQueryDto,
  CreateTimeOffDto,
  ReplaceAvailabilityRulesDto,
  TimeOffQueryDto,
} from './dto/availability.dto';

const SLOT_STEP_MINUTES = 15;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getSlots(
    organizationId: string,
    query: AvailabilitySlotsQueryDto,
  ): Promise<AvailabilitySlotsResponse> {
    const [organization, employee, service, link] = await Promise.all([
      this.prisma.organization.findFirst({
        where: { id: organizationId, status: 'ACTIVE' },
        select: { timezone: true },
      }),
      this.prisma.employee.findFirst({
        where: { id: query.employeeId, organizationId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.prisma.service.findFirst({
        where: { id: query.serviceId, organizationId, status: 'ACTIVE' },
        select: { id: true, durationMinutes: true, bufferBeforeMinutes: true, bufferAfterMinutes: true },
      }),
      this.prisma.employeeService.findFirst({
        where: {
          organizationId,
          employeeId: query.employeeId,
          serviceId: query.serviceId,
        },
        select: { id: true },
      }),
    ]);

    if (!organization) {
      throw new AppError(
        ErrorCode.ORGANIZATION_INACTIVE,
        403,
        'La organización no está activa',
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

    const date = query.date;
    let weekday: number;
    let dayStart: Date;
    let dayEnd: Date;
    try {
      weekday = dateKeyWeekday(date);
      dayStart = zonedDateTimeToUtc(date, 0, organization.timezone);
      dayEnd = zonedDateTimeToUtc(date, 1_440, organization.timezone);
    } catch {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'La fecha no es válida (usa YYYY-MM-DD)',
        { field: 'date' },
      );
    }

    const [rules, appointments, timeOff] = await Promise.all([
      this.prisma.availabilityRule.findMany({
        where: { organizationId, employeeId: employee.id, weekday },
        orderBy: { startMinute: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: {
          organizationId,
          employeeId: employee.id,
          status: { not: 'CANCELLED' },
          blockedFromAt: { lt: dayEnd },
          blockedUntilAt: { gt: dayStart },
        },
        select: { blockedFromAt: true, blockedUntilAt: true },
      }),
      this.prisma.timeOff.findMany({
        where: {
          organizationId,
          employeeId: employee.id,
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    const now = Date.now();
    const slots = new Map<number, { startAt: string; endAt: string }>();

    for (const rule of rules) {
      const lastStart = rule.endMinute - service.durationMinutes;
      for (
        let minute = rule.startMinute;
        minute <= lastStart;
        minute += SLOT_STEP_MINUTES
      ) {
        const startAt = zonedDateTimeToUtc(date, minute, organization.timezone);
        if (startAt.getTime() <= now) {
          continue;
        }

        const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
        const blockedFrom = new Date(
          startAt.getTime() - service.bufferBeforeMinutes * 60_000,
        );
        const blockedUntil = new Date(
          endAt.getTime() + service.bufferAfterMinutes * 60_000,
        );

        const overlapsAppointment = appointments.some(
          (appointment) =>
            appointment.blockedFromAt < blockedUntil &&
            appointment.blockedUntilAt > blockedFrom,
        );
        const overlapsTimeOff = timeOff.some(
          (block) => block.startsAt < blockedUntil && block.endsAt > blockedFrom,
        );

        if (overlapsAppointment || overlapsTimeOff) {
          continue;
        }

        slots.set(startAt.getTime(), {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
      }
    }

    return {
      date,
      timezone: organization.timezone,
      employeeId: employee.id,
      serviceId: service.id,
      durationMinutes: service.durationMinutes,
      slots: [...slots.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    };
  }

  async listRules(
    organizationId: string,
    employeeId: string,
  ): Promise<AvailabilityRule[]> {
    await this.assertEmployee(organizationId, employeeId);

    const rules = await this.prisma.availabilityRule.findMany({
      where: { organizationId, employeeId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });

    return rules.map(mapRule);
  }

  async replaceRules(
    organizationId: string,
    actorUserId: string,
    employeeId: string,
    dto: ReplaceAvailabilityRulesDto,
    meta: RequestMetadata,
  ): Promise<AvailabilityRule[]> {
    await this.assertEmployee(organizationId, employeeId);
    assertRulesDoNotOverlap(dto);

    const rules = await this.prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({
        where: { organizationId, employeeId },
      });

      if (dto.rules.length > 0) {
        await tx.availabilityRule.createMany({
          data: dto.rules.map((rule) => ({
            organizationId,
            employeeId,
            weekday: rule.weekday,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
          })),
        });
      }

      return tx.availabilityRule.findMany({
        where: { organizationId, employeeId },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'availability.rules_replaced',
      entity: 'employee',
      entityId: employeeId,
      metadata: { rules: dto.rules.length },
      ...meta,
    });

    return rules.map(mapRule);
  }

  async listTimeOff(
    organizationId: string,
    employeeId: string,
    query: TimeOffQueryDto,
  ): Promise<TimeOff[]> {
    await this.assertEmployee(organizationId, employeeId);
    assertRange(query.from, query.to);

    const timeOff = await this.prisma.timeOff.findMany({
      where: {
        organizationId,
        employeeId,
        ...(query.from || query.to
          ? {
              startsAt: query.to ? { lt: new Date(query.to) } : undefined,
              endsAt: query.from ? { gt: new Date(query.from) } : undefined,
            }
          : {}),
      },
      orderBy: { startsAt: 'asc' },
    });

    return timeOff.map(mapTimeOff);
  }

  async createTimeOff(
    organizationId: string,
    actorUserId: string,
    employeeId: string,
    dto: CreateTimeOffDto,
    meta: RequestMetadata,
  ): Promise<TimeOff> {
    await this.assertEmployee(organizationId, employeeId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'El rango de bloqueo no es válido',
      );
    }

    const timeOff = await this.prisma.timeOff.create({
      data: {
        organizationId,
        employeeId,
        startsAt,
        endsAt,
        reason: dto.reason || null,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'availability.time_off_created',
      entity: 'time_off',
      entityId: timeOff.id,
      metadata: { employeeId, startsAt: dto.startsAt, endsAt: dto.endsAt },
      ...meta,
    });

    return mapTimeOff(timeOff);
  }

  async deleteTimeOff(
    organizationId: string,
    actorUserId: string,
    timeOffId: string,
    meta: RequestMetadata,
  ): Promise<void> {
    const existing = await this.prisma.timeOff.findFirst({
      where: { id: timeOffId, organizationId },
    });

    if (!existing) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El bloqueo no existe en esta organización',
      );
    }

    // tenant-scope-exempt: el bloqueo se verificó arriba con organizationId
    await this.prisma.timeOff.delete({ where: { id: timeOffId } });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'availability.time_off_deleted',
      entity: 'time_off',
      entityId: timeOffId,
      metadata: { employeeId: existing.employeeId },
      ...meta,
    });
  }

  private async assertEmployee(
    organizationId: string,
    employeeId: string,
  ): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true },
    });

    if (!employee) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El empleado no existe en esta organización',
      );
    }
  }
}

function assertRulesDoNotOverlap(dto: ReplaceAvailabilityRulesDto): void {
  const byWeekday = new Map<number, Array<{ startMinute: number; endMinute: number }>>();

  for (const rule of dto.rules) {
    if (rule.endMinute <= rule.startMinute) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'La hora de fin debe ser posterior a la de inicio',
        { field: 'rules' },
      );
    }

    const dayRules = byWeekday.get(rule.weekday) ?? [];
    dayRules.push(rule);
    byWeekday.set(rule.weekday, dayRules);
  }

  for (const [weekday, rules] of byWeekday) {
    rules.sort((a, b) => a.startMinute - b.startMinute);
    for (let index = 1; index < rules.length; index += 1) {
      const previous = rules[index - 1];
      const current = rules[index];
      if (previous && current && current.startMinute < previous.endMinute) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          `Los horarios del día ${weekday} se solapan`,
          { field: 'rules' },
        );
      }
    }
  }
}

function assertRange(from: string | undefined, to: string | undefined): void {
  if (from && to && new Date(from) >= new Date(to)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      'El rango de fechas no es válido',
      { field: 'from' },
    );
  }
}

function mapRule(rule: AvailabilityRuleRecord): AvailabilityRule {
  return {
    id: rule.id,
    employeeId: rule.employeeId,
    weekday: rule.weekday,
    startMinute: rule.startMinute,
    endMinute: rule.endMinute,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function mapTimeOff(timeOff: TimeOffRecord): TimeOff {
  return {
    id: timeOff.id,
    employeeId: timeOff.employeeId,
    startsAt: timeOff.startsAt.toISOString(),
    endsAt: timeOff.endsAt.toISOString(),
    reason: timeOff.reason,
    createdAt: timeOff.createdAt.toISOString(),
  };
}
