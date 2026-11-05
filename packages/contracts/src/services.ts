import { z } from 'zod';

export const SERVICE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceCents: number;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export const createServiceSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es demasiado corto').max(120),
  description: z.string().trim().max(2_000).optional(),
  durationMinutes: z.number().int().min(1).max(1_440),
  bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
  priceCents: z.number().int().min(0).max(100_000_000).default(0),
});

export const updateServiceSchema = createServiceSchema
  .partial()
  .extend({ status: z.enum(SERVICE_STATUSES).optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Envía al menos un campo para actualizar',
  });

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
