import { z } from 'zod';

export const CLIENT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

export const createClientSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es demasiado corto').max(120),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'El correo no es válido',
    })
    .optional(),
  phone: z.string().trim().max(32).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const updateClientSchema = createClientSchema
  .extend({ status: z.enum(CLIENT_STATUSES).optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Envía al menos un campo para actualizar',
  });

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
