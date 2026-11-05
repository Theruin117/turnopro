import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  ROLES,
  SLUG_REGEX,
} from '@turnopro/shared';
import { z } from 'zod';

const emailSchema = z
  .email({ error: 'Ingresa un correo electrónico válido' })
  .max(254, 'El correo es demasiado largo');

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`);

const organizationSlugSchema = z
  .string()
  .trim()
  .min(3, 'El identificador debe tener al menos 3 caracteres')
  .max(48, 'El identificador no puede superar 48 caracteres')
  .regex(
    SLUG_REGEX,
    'Usa solo minúsculas, números y guiones (ej. mi-negocio)',
  );

export const registerSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, 'El nombre del negocio es obligatorio')
    .max(80, 'El nombre del negocio es demasiado largo'),
  organizationSlug: organizationSlugSchema,
  name: z
    .string()
    .trim()
    .min(2, 'Tu nombre es obligatorio')
    .max(120, 'El nombre es demasiado largo'),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'La contraseña es obligatoria').max(PASSWORD_MAX_LENGTH),
  organizationSlug: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    organizationSlugSchema.optional(),
  ),
});

export const updateOrganizationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre del negocio es obligatorio')
      .max(80, 'El nombre del negocio es demasiado largo')
      .optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Usa un código ISO 4217 de tres letras (ej. MXN)')
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Envía al menos un campo para actualizar',
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/** Estados que un miembro existente puede recibir desde la API. */
export const MEMBER_STATUS_TARGETS = ['ACTIVE', 'SUSPENDED'] as const;
export type MemberStatusTarget = (typeof MEMBER_STATUS_TARGETS)[number];

export const updateMemberSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(MEMBER_STATUS_TARGETS).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'Envía al menos un campo para actualizar',
  });

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
