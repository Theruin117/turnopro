/**
 * Cálculo puro de la ventana que ocupa un turno, incluidos los buffers del
 * servicio. Se comparte entre creación y reprogramación para que ambos caminos
 * bloqueen exactamente el mismo rango.
 */
export interface BookingWindow {
  startAt: Date;
  endAt: Date;
  blockedFromAt: Date;
  blockedUntilAt: Date;
}

export interface BookableService {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export function computeBookingWindow(startAt: Date, service: BookableService): BookingWindow {
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  return {
    startAt,
    endAt,
    blockedFromAt: new Date(startAt.getTime() - service.bufferBeforeMinutes * 60_000),
    blockedUntilAt: new Date(endAt.getTime() + service.bufferAfterMinutes * 60_000),
  };
}
