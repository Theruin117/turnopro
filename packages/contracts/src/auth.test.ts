import { describe, expect, it } from 'vitest';

import { loginSchema, registerSchema, updateOrganizationSchema } from '../src/auth';

const validRegistration = {
  organizationName: 'Estudio Aurora',
  organizationSlug: 'estudio-aurora',
  name: 'Ana Torres',
  email: 'ana@example.com',
  password: 'una-clave-segura-2026',
};

describe('contratos de autenticación', () => {
  it('acepta un registro válido', () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it('rechaza contraseñas cortas y slugs inválidos', () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: 'corta',
      organizationSlug: 'Estudio Aurora',
    });
    expect(result.success).toBe(false);
  });

  it('convierte un slug vacío de login en undefined', () => {
    const result = loginSchema.parse({
      email: 'ana@example.com',
      password: 'secreta',
      organizationSlug: '   ',
    });
    expect(result.organizationSlug).toBeUndefined();
  });

  it('exige al menos un campo al actualizar la organización', () => {
    expect(updateOrganizationSchema.safeParse({}).success).toBe(false);
    expect(updateOrganizationSchema.safeParse({ name: 'Nuevo nombre' }).success).toBe(true);
  });

  it('normaliza la moneda a mayúsculas', () => {
    const result = updateOrganizationSchema.parse({ currency: 'mxn' });
    expect(result.currency).toBe('MXN');
  });
});
