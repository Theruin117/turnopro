import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../src/errors';
import { isValidCurrency, isValidSlug, isValidTimezone, normalizeEmail, slugify } from '../src/utils';

describe('utilidades compartidas', () => {
  it('normaliza emails', () => {
    expect(normalizeEmail('  Owner@Demo.TurnoPro.Local ')).toBe('owner@demo.turnopro.local');
  });

  it('genera slugs sin acentos ni caracteres inválidos', () => {
    expect(slugify('  Salón de Belleza Ñandú  ')).toBe('salon-de-belleza-nandu');
    expect(isValidSlug('salon-de-belleza')).toBe(true);
    expect(isValidSlug('-salon-')).toBe(false);
    expect(isValidSlug('Salon')).toBe(false);
  });

  it('valida zonas horarias IANA', () => {
    expect(isValidTimezone('America/Bogota')).toBe(true);
    expect(isValidTimezone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimezone('Marte/Olympus')).toBe(false);
  });

  it('valida códigos ISO 4217', () => {
    expect(isValidCurrency('MXN')).toBe(true);
    expect(isValidCurrency('USD')).toBe(true);
    expect(isValidCurrency('mxn')).toBe(false);
    expect(isValidCurrency('XXX')).toBe(false);
  });

  it('conserva la información de AppError', () => {
    const error = new AppError(ErrorCode.FORBIDDEN, 403, 'Sin acceso', { reason: 'test' });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe(ErrorCode.FORBIDDEN);
    expect(error.statusCode).toBe(403);
    expect(error.details).toEqual({ reason: 'test' });
  });
});
