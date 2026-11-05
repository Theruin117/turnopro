import { describe, expect, it } from 'vitest';

import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TRANSITIONS,
  canTransitionAppointment,
  updateAppointmentStatusSchema,
} from '@turnopro/contracts';

describe('máquina de estados de turnos', () => {
  it('permite las transiciones operativas esperadas', () => {
    expect(canTransitionAppointment('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransitionAppointment('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransitionAppointment('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canTransitionAppointment('CONFIRMED', 'NO_SHOW')).toBe(true);
    expect(canTransitionAppointment('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('trata COMPLETED, CANCELLED y NO_SHOW como estados terminales', () => {
    for (const terminal of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const) {
      for (const target of APPOINTMENT_STATUSES) {
        expect(canTransitionAppointment(terminal, target)).toBe(false);
      }
      expect(APPOINTMENT_TRANSITIONS[terminal]).toHaveLength(0);
    }
  });

  it('no permite saltar de PENDING a COMPLETED o NO_SHOW', () => {
    expect(canTransitionAppointment('PENDING', 'COMPLETED')).toBe(false);
    expect(canTransitionAppointment('PENDING', 'NO_SHOW')).toBe(false);
  });

  it('valida el cuerpo del endpoint de estado', () => {
    expect(updateAppointmentStatusSchema.safeParse({ status: 'CONFIRMED' }).success).toBe(true);
    expect(
      updateAppointmentStatusSchema.safeParse({ status: 'CANCELLED', reason: 'Cliente ausente' })
        .success,
    ).toBe(true);
    expect(updateAppointmentStatusSchema.safeParse({ status: 'PENDING' }).success).toBe(false);
    expect(updateAppointmentStatusSchema.safeParse({}).success).toBe(false);
  });
});
