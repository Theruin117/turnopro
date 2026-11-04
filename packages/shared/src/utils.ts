import { SLUG_MAX_LENGTH, SLUG_REGEX } from './constants';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Convierte texto libre en un slug estable.
 * No sustituye la validación del DTO: solo facilita sugerencias en la UI.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

export function isValidSlug(value: string): boolean {
  return SLUG_REGEX.test(value);
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isValidCurrency(value: string): boolean {
  if (!/^[A-Z]{3}$/.test(value)) {
    return false;
  }
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function assertNever(value: never): never {
  throw new Error(`Valor no manejado: ${String(value)}`);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
