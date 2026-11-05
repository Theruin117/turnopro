import { z } from 'zod';

export interface AvailabilityRule {
  id: string;
  employeeId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimeOff {
  id: string;
  employeeId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdAt: string;
}

export interface AvailabilitySlot {
  startAt: string;
  endAt: string;
}

export interface AvailabilitySlotsResponse {
  date: string;
  timezone: string;
  employeeId: string;
  serviceId: string;
  durationMinutes: number;
  slots: AvailabilitySlot[];
}

export const availabilityRuleInputSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1_439),
    endMinute: z.number().int().min(1).max(1_440),
  })
  .refine((rule) => rule.endMinute > rule.startMinute, {
    message: 'La hora de fin debe ser posterior a la de inicio',
  });

export const replaceAvailabilityRulesSchema = z.object({
  rules: z.array(availabilityRuleInputSchema).max(50),
});

export const createTimeOffSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().max(240).optional(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'El fin debe ser posterior al inicio',
  });

export type AvailabilityRuleInput = z.infer<typeof availabilityRuleInputSchema>;
export type ReplaceAvailabilityRulesInput = z.infer<
  typeof replaceAvailabilityRulesSchema
>;
export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>;
