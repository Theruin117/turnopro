import { Injectable } from '@nestjs/common';
import type {
  DailyReportRow,
  EmployeeReportRow,
  ReportsSummary,
} from '@turnopro/contracts';
import {
  AppError,
  ErrorCode,
  addDaysToDateKey,
  dateKeyWeekday,
  formatDateKeyInTimeZone,
  zonedDateTimeToUtc,
} from '@turnopro/shared';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { ReportsSummaryQueryDto } from './dto/reports-summary-query.dto';

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;

interface ResolvedRange {
  from: Date;
  to: Date;
  timezone: string;
}

interface Interval {
  start: number;
  end: number;
}

interface EmployeeRecord {
  id: string;
  name: string;
  status: string;
}

interface RuleRecord {
  employeeId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

interface TimeOffRecord {
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
}

interface EmployeeAccumulator {
  appointments: number;
  completed: number;
  bookedMinutes: number;
  revenueCents: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    organizationId: string,
    query: ReportsSummaryQueryDto,
  ): Promise<ReportsSummary> {
    const range = await this.resolveRange(organizationId, query);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId,
        startAt: { gte: range.from, lt: range.to },
      },
      select: {
        status: true,
        startAt: true,
        endAt: true,
        employeeId: true,
        service: { select: { priceCents: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    const employees = await this.prisma.employee.findMany({
      where: { organizationId },
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
    });

    const appointmentCountByEmployee = new Map<string, number>();
    for (const appointment of appointments) {
      appointmentCountByEmployee.set(
        appointment.employeeId,
        (appointmentCountByEmployee.get(appointment.employeeId) ?? 0) + 1,
      );
    }

    const includedEmployees = employees.filter(
      (employee: EmployeeRecord) =>
        employee.status === 'ACTIVE' ||
        (appointmentCountByEmployee.get(employee.id) ?? 0) > 0,
    );
    const employeeIds = includedEmployees.map((employee) => employee.id);

    const [rules, timeOff] = await Promise.all([
      this.prisma.availabilityRule.findMany({
        where: { organizationId, employeeId: { in: employeeIds } },
        select: {
          employeeId: true,
          weekday: true,
          startMinute: true,
          endMinute: true,
        },
      }),
      this.prisma.timeOff.findMany({
        where: {
          organizationId,
          employeeId: { in: employeeIds },
          startsAt: { lt: range.to },
          endsAt: { gt: range.from },
        },
        select: { employeeId: true, startsAt: true, endsAt: true },
      }),
    ]);

    const rulesByEmployee = groupByEmployee(rules);
    const timeOffByEmployee = groupByEmployee(timeOff);
    const statsByEmployee = new Map<string, EmployeeAccumulator>();

    let pending = 0;
    let confirmed = 0;
    let completed = 0;
    let cancelled = 0;
    let noShow = 0;
    let revenueCents = 0;
    const byDay = new Map<string, DailyReportRow>();

    for (const appointment of appointments) {
      const stats = statsByEmployee.get(appointment.employeeId) ?? {
        appointments: 0,
        completed: 0,
        bookedMinutes: 0,
        revenueCents: 0,
      };

      stats.appointments += 1;

      switch (appointment.status) {
        case 'PENDING':
          pending += 1;
          break;
        case 'CONFIRMED':
          confirmed += 1;
          break;
        case 'COMPLETED':
          completed += 1;
          stats.completed += 1;
          stats.revenueCents += appointment.service.priceCents;
          revenueCents += appointment.service.priceCents;
          break;
        case 'CANCELLED':
          cancelled += 1;
          break;
        case 'NO_SHOW':
          noShow += 1;
          break;
      }

      if (appointment.status !== 'CANCELLED') {
        stats.bookedMinutes += Math.round(
          (appointment.endAt.getTime() - appointment.startAt.getTime()) / MINUTE_MS,
        );
      }

      statsByEmployee.set(appointment.employeeId, stats);

      const date = formatDateKeyInTimeZone(appointment.startAt, range.timezone);
      const day = byDay.get(date) ?? { date, appointments: 0, revenueCents: 0 };
      day.appointments += 1;
      if (appointment.status === 'COMPLETED') {
        day.revenueCents += appointment.service.priceCents;
      }
      byDay.set(date, day);
    }

    const byEmployee: EmployeeReportRow[] = includedEmployees.map((employee) => {
      const stats = statsByEmployee.get(employee.id) ?? {
        appointments: 0,
        completed: 0,
        bookedMinutes: 0,
        revenueCents: 0,
      };
      const availableMinutes = calculateAvailableMinutes(
        range.from,
        range.to,
        range.timezone,
        rulesByEmployee.get(employee.id) ?? [],
        timeOffByEmployee.get(employee.id) ?? [],
      );

      return {
        employeeId: employee.id,
        name: employee.name,
        appointments: stats.appointments,
        completed: stats.completed,
        bookedMinutes: stats.bookedMinutes,
        availableMinutes,
        occupancyRate:
          availableMinutes > 0
            ? roundRate(Math.min(1, stats.bookedMinutes / availableMinutes))
            : 0,
        revenueCents: stats.revenueCents,
      };
    });

    const totalAppointments = appointments.length;

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      totals: {
        appointments: totalAppointments,
        pending,
        confirmed,
        completed,
        cancelled,
        noShow,
        revenueCents,
        cancellationRate:
          totalAppointments > 0
            ? roundRate(cancelled / totalAppointments)
            : 0,
        noShowRate:
          totalAppointments > 0 ? roundRate(noShow / totalAppointments) : 0,
      },
      byEmployee,
      byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  private async resolveRange(
    organizationId: string,
    query: ReportsSummaryQueryDto,
  ): Promise<ResolvedRange> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { timezone: true },
    });

    if (!organization) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'La organización no existe');
    }

    const now = new Date();
    const todayKey = formatDateKeyInTimeZone(now, organization.timezone);
    const endOfToday = zonedDateTimeToUtc(
      addDaysToDateKey(todayKey, 1),
      0,
      organization.timezone,
    );
    const defaultFrom = zonedDateTimeToUtc(
      addDaysToDateKey(todayKey, -(DEFAULT_RANGE_DAYS - 1)),
      0,
      organization.timezone,
    );

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime()))
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'El rango de fechas no es válido',
        { field: 'from' },
      );
    }

    const resolvedFrom = from ?? (to ? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS) : defaultFrom);
    const resolvedTo = to ?? endOfToday;

    if (resolvedFrom.getTime() >= resolvedTo.getTime()) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'El rango de fechas no es válido',
        { field: 'from' },
      );
    }

    if (resolvedTo.getTime() - resolvedFrom.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        `El rango máximo es de ${MAX_RANGE_DAYS} días`,
        { field: 'from' },
      );
    }

    return {
      from: resolvedFrom,
      to: resolvedTo,
      timezone: organization.timezone,
    };
  }
}

function groupByEmployee<T extends { employeeId: string }>(
  records: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const record of records) {
    const bucket = grouped.get(record.employeeId) ?? [];
    bucket.push(record);
    grouped.set(record.employeeId, bucket);
  }

  return grouped;
}

/**
 * Suma las ventanas de disponibilidad del rango en la zona de la organización y
 * descuenta los bloqueos (`time_off`). Las reglas solapadas se fusionan para no
 * contar minutos dos veces.
 */
function calculateAvailableMinutes(
  from: Date,
  to: Date,
  timezone: string,
  rules: RuleRecord[],
  timeOff: TimeOffRecord[],
): number {
  if (rules.length === 0) {
    return 0;
  }

  const firstKey = formatDateKeyInTimeZone(from, timezone);
  const lastKey = formatDateKeyInTimeZone(new Date(to.getTime() - 1), timezone);
  let totalMs = 0;
  let dateKey = firstKey;

  while (dateKey <= lastKey) {
    const weekday = dateKeyWeekday(dateKey);
    const dailyIntervals = mergeIntervals(
      rules
        .filter((rule) => rule.weekday === weekday)
        .map((rule) => ({
          start: Math.max(
            zonedDateTimeToUtc(dateKey, rule.startMinute, timezone).getTime(),
            from.getTime(),
          ),
          end: Math.min(
            zonedDateTimeToUtc(dateKey, rule.endMinute, timezone).getTime(),
            to.getTime(),
          ),
        }))
        .filter((interval) => interval.end > interval.start),
    );

    const available = subtractIntervals(
      dailyIntervals,
      timeOff.map((block) => ({
        start: block.startsAt.getTime(),
        end: block.endsAt.getTime(),
      })),
    );

    totalMs += available.reduce(
      (sum, interval) => sum + (interval.end - interval.start),
      0,
    );

    dateKey = addDaysToDateKey(dateKey, 1);
  }

  return Math.round(totalMs / MINUTE_MS);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) {
    return intervals;
  }

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  let current = sorted[0] as Interval;

  for (const interval of sorted.slice(1)) {
    if (interval.start <= current.end) {
      current = {
        start: current.start,
        end: Math.max(current.end, interval.end),
      };
      continue;
    }

    merged.push(current);
    current = interval;
  }

  merged.push(current);
  return merged;
}

function subtractIntervals(intervals: Interval[], blockers: Interval[]): Interval[] {
  let result = intervals;

  for (const blocker of blockers) {
    const next: Interval[] = [];

    for (const interval of result) {
      if (blocker.end <= interval.start || blocker.start >= interval.end) {
        next.push(interval);
        continue;
      }

      if (blocker.start > interval.start) {
        next.push({ start: interval.start, end: blocker.start });
      }
      if (blocker.end < interval.end) {
        next.push({ start: blocker.end, end: interval.end });
      }
    }

    result = next;
  }

  return result;
}

function roundRate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
