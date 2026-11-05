import { z } from 'zod';

export const APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * Transiciones válidas de un turno. Los estados terminales no tienen salida.
 * `CANCELLED` siempre pasa por el flujo de cancelación (motivo y `cancelledAt`).
 */
export const APPOINTMENT_TRANSITIONS: Record<
  AppointmentStatus,
  readonly AppointmentStatus[]
> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionAppointment(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}

/** Estados a los que se puede llegar por `PATCH /appointments/:id/status`. */
export const APPOINTMENT_STATUS_TARGETS = ['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const;

export type AppointmentStatusTarget = (typeof APPOINTMENT_STATUS_TARGETS)[number];

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUS_TARGETS),
  reason: z.string().trim().min(3).max(240).optional(),
});

export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;

export const createAppointmentSchema = z.object({
  clientId: z.uuid('El cliente no es válido'),
  employeeId: z.uuid('El empleado no es válido'),
  serviceId: z.uuid('El servicio no es válido'),
  startAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(2_000).optional(),
  /**
   * Clave de idempotencia por organización. La API también acepta la
   * cabecera `Idempotency-Key`, que es la forma recomendada.
   */
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, 'La clave de idempotencia contiene caracteres inválidos')
    .optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export interface AppointmentParty {
  id: string;
  name: string;
}

export interface AppointmentServiceSummary {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  blockedFromAt: string;
  blockedUntilAt: string;
  status: AppointmentStatus;
  notes: string | null;
  idempotencyKey: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  client: AppointmentParty;
  employee: AppointmentParty;
  service: AppointmentServiceSummary;
}
