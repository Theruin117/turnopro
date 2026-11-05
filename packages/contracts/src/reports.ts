import { z } from 'zod';

export const reportsSummaryQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export type ReportsSummaryQuery = z.infer<typeof reportsSummaryQuerySchema>;

export interface ReportsRange {
  from: string;
  to: string;
}

export interface ReportsTotals {
  appointments: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  revenueCents: number;
  cancellationRate: number;
  noShowRate: number;
}

export interface EmployeeReportRow {
  employeeId: string;
  name: string;
  appointments: number;
  completed: number;
  bookedMinutes: number;
  availableMinutes: number;
  occupancyRate: number;
  revenueCents: number;
}

export interface DailyReportRow {
  date: string;
  appointments: number;
  revenueCents: number;
}

export interface ReportsSummary {
  range: ReportsRange;
  totals: ReportsTotals;
  byEmployee: EmployeeReportRow[];
  byDay: DailyReportRow[];
}
