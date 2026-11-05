'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  Appointment,
  AvailabilitySlotsResponse,
  Client,
  Employee,
  PaginatedResponse,
} from '@turnopro/contracts';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Skeleton,
  Separator,
  Textarea,
  buttonVariants,
  cn,
} from '@turnopro/ui';
import {
  addDaysToDateKey,
  todayInTimeZone,
  zonedDateTimeToUtc,
} from '@turnopro/shared';

import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch, ApiError } from '@/lib/api';

const STATUS_LABELS: Record<Appointment['status'], string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'No asistió',
};

const STATUS_VARIANTS: Record<
  Appointment['status'],
  'default' | 'secondary' | 'success' | 'warning' | 'destructive'
> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  COMPLETED: 'default',
  CANCELLED: 'destructive',
  NO_SHOW: 'secondary',
};

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

function formatLongDate(dateKey: string): string {
  if (!dateKey) return 'Selecciona una fecha';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

export function AgendaView() {
  const { session, hasPermission } = useAuth();
  const timezone = session?.organization.timezone ?? 'America/Mexico_City';
  const canWrite = hasPermission('appointments:write');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [date, setDate] = useState(() => todayInTimeZone(timezone));
  const [employeeId, setEmployeeId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlotsResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status === 'ACTIVE'),
    [employees],
  );

  const selectedEmployee = useMemo(
    () => activeEmployees.find((employee) => employee.id === employeeId) ?? null,
    [activeEmployees, employeeId],
  );

  const availableServices = useMemo(
    () =>
      (selectedEmployee?.services ?? []).filter((service) => service.status === 'ACTIVE'),
    [selectedEmployee],
  );

  useEffect(() => {
    let active = true;
    // Carga inicial del catálogo remoto de la agenda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCatalog(true);
    Promise.all([
      apiFetch<PaginatedResponse<Employee>>('/employees?pageSize=100&status=ACTIVE'),
      apiFetch<PaginatedResponse<Client>>('/clients?pageSize=100&status=ACTIVE'),
    ])
      .then(([employeePage, clientPage]) => {
        if (!active) return;
        setEmployees(employeePage.items);
        setClients(clientPage.items);
        setEmployeeId((current) => current || employeePage.items[0]?.id || '');
        setClientId((current) => current || clientPage.items[0]?.id || '');
      })
      .catch((cause) => {
        if (active) {
          setError(errorMessage(cause, 'No se pudo cargar el catálogo de la agenda'));
        }
      })
      .finally(() => {
        if (active) setLoadingCatalog(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Mantiene el servicio seleccionado dentro de la oferta del empleado.
    if (availableServices.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServiceId('');
      return;
    }
    if (!availableServices.some((service) => service.id === serviceId)) {
      setServiceId(availableServices[0]?.id ?? '');
    }
  }, [availableServices, serviceId]);

  const loadSlots = useCallback(async () => {
    if (!employeeId || !serviceId || !date) {
      setSlots(null);
      return;
    }
    setLoadingSlots(true);
    setError(null);
    try {
      const query = new URLSearchParams({ employeeId, serviceId, date });
      setSlots(
        await apiFetch<AvailabilitySlotsResponse>(`/availability/slots?${query.toString()}`),
      );
    } catch (cause) {
      setSlots(null);
      setError(errorMessage(cause, 'No se pudieron calcular los horarios disponibles'));
    } finally {
      setLoadingSlots(false);
    }
  }, [date, employeeId, serviceId]);

  const loadAppointments = useCallback(async () => {
    if (!date) {
      setAppointments([]);
      return;
    }
    setLoadingAppointments(true);
    try {
      const from = zonedDateTimeToUtc(date, 0, timezone).toISOString();
      const to = zonedDateTimeToUtc(addDaysToDateKey(date, 1), 0, timezone).toISOString();
      const query = new URLSearchParams({ from, to, pageSize: '100' });
      const page = await apiFetch<PaginatedResponse<Appointment>>(
        `/appointments?${query.toString()}`,
      );
      setAppointments(page.items);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo cargar la agenda del día'));
    } finally {
      setLoadingAppointments(false);
    }
  }, [date, timezone]);

  useEffect(() => {
    // Sincroniza los slots con la fecha y la selección actual.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    // Sincroniza los turnos del día con la fecha seleccionada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    // Al cambiar de contexto el horario elegido deja de ser válido.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedStart(null);
  }, [date, employeeId, serviceId]);

  async function book(): Promise<void> {
    if (!selectedStart || !employeeId || !serviceId || !clientId) {
      setError('Selecciona un horario y un cliente para reservar');
      return;
    }
    setBooking(true);
    setError(null);
    try {
      await apiFetch('/appointments', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          clientId,
          employeeId,
          serviceId,
          startAt: selectedStart,
          notes: notes || undefined,
        },
      });
      setSelectedStart(null);
      setNotes('');
      await Promise.all([loadSlots(), loadAppointments()]);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo crear el turno'));
    } finally {
      setBooking(false);
    }
  }

  async function cancel(appointment: Appointment): Promise<void> {
    if (!window.confirm('¿Cancelar este turno? El horario volverá a estar disponible.')) {
      return;
    }
    setError(null);
    try {
      await apiFetch(`/appointments/${appointment.id}/cancel`, {
        method: 'PATCH',
        body: {},
      });
      await Promise.all([loadSlots(), loadAppointments()]);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo cancelar el turno'));
    }
  }

  const selectedService = availableServices.find((service) => service.id === serviceId) ?? null;
  const activeAppointments = appointments.filter(
    (appointment) => appointment.status !== 'CANCELLED',
  );
  const cancelledAppointments = appointments.filter(
    (appointment) => appointment.status === 'CANCELLED',
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Agenda
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Calendario del día</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Disponibilidad calculada con reglas, buffers, bloqueos y turnos existentes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate(addDaysToDateKey(date, -1))}
          >
            ← Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDate(todayInTimeZone(timezone))}>
            Hoy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate(addDaysToDateKey(date, 1))}
          >
            Siguiente →
          </Button>
        </div>
      </div>

      <Card className="mt-6">
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="agenda-date">Fecha</Label>
            <Input
              id="agenda-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{formatLongDate(date)}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agenda-employee">Empleado</Label>
            <Select
              id="agenda-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              disabled={loadingCatalog}
            >
              {activeEmployees.length === 0 ? <option value="">Sin empleados activos</option> : null}
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agenda-service">Servicio</Label>
            <Select
              id="agenda-service"
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              disabled={loadingCatalog || availableServices.length === 0}
            >
              {availableServices.length === 0 ? (
                <option value="">Sin servicios asignados</option>
              ) : null}
              {availableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.durationMinutes} min
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>No se pudo completar la operación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loadingCatalog ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Horarios disponibles</CardTitle>
              <CardDescription>
                {selectedEmployee
                  ? `${selectedEmployee.name} · ${selectedService?.durationMinutes ?? 0} min`
                  : 'Selecciona un empleado para ver horarios'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSlots ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <Skeleton key={index} className="h-9 w-full" />
                  ))}
                </div>
              ) : !slots || slots.slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay horarios disponibles para esta fecha. Revisa las reglas de
                  disponibilidad o los bloqueos del empleado.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.slots.map((slot) => (
                    <button
                      key={slot.startAt}
                      type="button"
                      onClick={() => setSelectedStart(slot.startAt)}
                      className={cn(
                        buttonVariants({
                          variant: selectedStart === slot.startAt ? 'default' : 'outline',
                          size: 'sm',
                        }),
                        'w-full',
                      )}
                    >
                      {formatTime(slot.startAt, timezone)}
                    </button>
                  ))}
                </div>
              )}

              {selectedStart ? (
                <div className="mt-5 space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div>
                    <p className="text-sm font-medium">
                      Reservar a las {formatTime(selectedStart, timezone)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedService?.name ?? 'Servicio'} ·{' '}
                      {selectedEmployee?.name ?? 'Empleado'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agenda-client">Cliente</Label>
                    <Select
                      id="agenda-client"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                    >
                      {clients.length === 0 ? (
                        <option value="">Registra un cliente en el catálogo</option>
                      ) : null}
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agenda-notes">Notas</Label>
                    <Textarea
                      id="agenda-notes"
                      maxLength={2000}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => void book()}
                      loading={booking}
                      disabled={!canWrite || !clientId}
                    >
                      Confirmar turno
                    </Button>
                    <Button variant="ghost" onClick={() => setSelectedStart(null)}>
                      Cancelar
                    </Button>
                  </div>
                  {!canWrite ? (
                    <p className="text-xs text-muted-foreground">
                      Tu rol puede consultar la agenda, pero no crear turnos.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Turnos del día</CardTitle>
              <CardDescription>
                {activeAppointments.length} activo(s) · {cancelledAppointments.length}{' '}
                cancelado(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingAppointments ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin turnos para esta fecha.
                </p>
              ) : (
                appointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className={cn(
                      'rounded-lg border p-3',
                      appointment.status === 'CANCELLED' && 'opacity-60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {formatTime(appointment.startAt, timezone)} –{' '}
                          {formatTime(appointment.endAt, timezone)}
                        </p>
                        <p className="text-sm">{appointment.client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {appointment.service.name} · {appointment.employee.name}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANTS[appointment.status]}>
                        {STATUS_LABELS[appointment.status]}
                      </Badge>
                    </div>
                    {appointment.notes ? (
                      <p className="mt-2 text-xs text-muted-foreground">{appointment.notes}</p>
                    ) : null}
                    {canWrite &&
                    appointment.status !== 'CANCELLED' &&
                    appointment.status !== 'COMPLETED' ? (
                      <>
                        <Separator className="my-2" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => void cancel(appointment)}
                        >
                          Cancelar turno
                        </Button>
                      </>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Los precios se definen en{' '}
        <a href="/catalog" className="underline underline-offset-2">
          Catálogo
        </a>{' '}
        y los horarios semanales en{' '}
        <a href="/availability" className="underline underline-offset-2">
          Disponibilidad
        </a>
        .
      </p>
    </div>
  );
}
