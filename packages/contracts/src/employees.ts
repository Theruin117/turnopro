import { z } from 'zod';

import type { ServiceStatus } from './services';

export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface EmployeeServiceSummary {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  status: ServiceStatus;
}

export interface Employee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  color: string | null;
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
  services: EmployeeServiceSummary[];
}

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: 'El correo no es válido',
  })
  .optional();

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es demasiado corto').max(120),
  email: optionalEmail,
  phone: z.string().trim().max(32).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Usa un color hexadecimal como #2563EB')
    .optional(),
  serviceIds: z.array(z.uuid('El servicio no es válido')).max(50).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema
  .extend({ status: z.enum(EMPLOYEE_STATUSES).optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Envía al menos un campo para actualizar',
  });

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
