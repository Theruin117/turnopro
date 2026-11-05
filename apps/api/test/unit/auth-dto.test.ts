import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { LoginDto, RegisterDto } from '../../src/modules/auth/dto/auth.dto';

describe('normalización de credenciales', () => {
  it('recorta espacios alrededor del correo y la contraseña al iniciar sesión', async () => {
    const dto = plainToInstance(LoginDto, {
      email: '  owner@demo.turnopro.local  ',
      password: ' TurnoProDemo123!\n',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.email).toBe('owner@demo.turnopro.local');
    expect(dto.password).toBe('TurnoProDemo123!');
  });

  it('recorta espacios alrededor de la contraseña al registrar', async () => {
    const dto = plainToInstance(RegisterDto, {
      organizationName: 'Estudio Aurora',
      organizationSlug: 'estudio-aurora',
      name: 'Ana Torres',
      email: 'ana@example.com',
      password: '  una-clave-segura-2026  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.password).toBe('una-clave-segura-2026');
  });

  it('mantiene los espacios internos de la contraseña', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'ana@example.com',
      password: '  frase secreta larga  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.password).toBe('frase secreta larga');
  });
});
