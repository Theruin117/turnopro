/**
 * Utilidades de fecha con zona horaria IANA.
 *
 * Las reglas de disponibilidad se guardan como minutos locales desde medianoche.
 * Para convertir una fecha local a un instante UTC se calcula el offset de la
 * zona en ese instante y se corrige de forma iterativa; así los cambios de
 * horario de verano no dependen de una librería externa.
 */

function datePartsFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function partsToRecord(parts: Intl.DateTimeFormatPart[]): Record<string, number> {
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = partsToRecord(datePartsFormatter(timeZone).formatToParts(date));
  const asUtc = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return asUtc - date.getTime();
}

export function assertDateKey(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError('La fecha debe tener el formato YYYY-MM-DD');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== (month ?? 1) - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError('La fecha no existe');
  }
  return value;
}

export function zonedDateTimeToUtc(
  dateKey: string,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  assertDateKey(dateKey);

  if (!Number.isFinite(minutesFromMidnight)) {
    throw new RangeError('Los minutos deben ser un número');
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const wallClockUtc = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hours, minutes);

  let timestamp = wallClockUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const corrected = wallClockUtc - getTimeZoneOffsetMs(new Date(timestamp), timeZone);
    if (corrected === timestamp) {
      break;
    }
    timestamp = corrected;
  }

  return new Date(timestamp);
}

export function formatDateKeyInTimeZone(
  value: Date | string,
  timeZone: string,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = partsToRecord(datePartsFormatter(timeZone).formatToParts(date));
  const year = String(parts.year ?? 0).padStart(4, '0');
  const month = String(parts.month ?? 1).padStart(2, '0');
  const day = String(parts.day ?? 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayInTimeZone(timeZone: string): string {
  return formatDateKeyInTimeZone(new Date(), timeZone);
}

export function dateKeyWeekday(dateKey: string): number {
  assertDateKey(dateKey);
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  assertDateKey(dateKey);
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfWeekDateKey(dateKey: string, weekStartsOn = 1): string {
  const weekday = dateKeyWeekday(dateKey);
  const diff = (weekday - weekStartsOn + 7) % 7;
  return addDaysToDateKey(dateKey, -diff);
}
