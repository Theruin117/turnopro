import { describe, expect, it } from 'vitest';

import { rescheduleAppointmentSchema } from '@turnopro/contracts';

import { computeBookingWindow } from '../../src/modules/appointments/booking-window';

describe('reprogramación de turnos', () => {
  it('acepta solo el nuevo inicio y conserva opcionales', () => {
    expect(
      rescheduleAppointmentSchema.safeParse({
        startAt: '2026-11-12T17:00:00.000Z',
      }).success,
    ).toBe(true);

    const parsed = rescheduleAppointmentSchema.parse({
      startAt: '2026-11-12T17:00:00.000Z',
      employeeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      serviceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
      notes: '  Reprogramado  ',
    });
    expect(parsed.notes).toBe('Reprogramado');
  });

  it('rechaza fechas inválidas e identificadores que no son UUID', () => {
    expect(
      rescheduleAppointmentSchema.safeParse({ startAt: 'mañana' }).success,
    ).toBe(false);
    expect(
      rescheduleAppointmentSchema.safeParse({
        startAt: '2026-11-12T17:00:00.000Z',
        employeeId: 'no-es-uuid',
      }).success,
    ).toBe(false);
  });

  it('calcula el rango bloqueado con los buffers del servicio', () => {
    const startAt = new Date('2026-11-12T17:00:00.000Z');
    const window = computeBookingWindow(startAt, {
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
    });

    expect(window.startAt.toISOString()).toBe('2026-11-12T17:00:00.000Z');
    expect(window.endAt.toISOString()).toBe('2026-11-12T17:30:00.000Z');
    expect(window.blockedFromAt.toISOString()).toBe('2026-11-12T16:55:00.000Z');
    expect(window.blockedUntilAt.toISOString()).toBe('2026-11-12T17:40:00.000Z');
  });
});
