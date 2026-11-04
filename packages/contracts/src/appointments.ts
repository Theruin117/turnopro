import { z } from 'zod';

export const APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

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
