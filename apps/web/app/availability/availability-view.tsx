'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type {
  AvailabilityRule,
  Employee,
  PaginatedResponse,
  TimeOff,
} from '@turnopro/contracts';
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Textarea,
} from '@turnopro/ui';
import { todayInTimeZone, zonedDateTimeToUtc } from '@turnopro/shared';

import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch, ApiError } from '@/lib/api';

const WEEKDAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

interface RuleDraft {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function localDateTimeToIso(value: string, timezone: string): string {
  const [dateKey = '', time = '00:00'] = value.split('T');
  return zonedDateTimeToUtc(dateKey, timeToMinutes(time), timezone).toISOString();
}

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

export function AvailabilityView() {
  const { session, hasPermission } = useAuth();
  const timezone = session?.organization.timezone ?? 'America/Mexico_City';
  const canWrite = hasPermission('employees:write');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [creatingTimeOff, setCreatingTimeOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [timeOffForm, setTimeOffForm] = useState({
    startsAt: `${todayInTimeZone(timezone)}T09:00`,
    endsAt: `${todayInTimeZone(timezone)}T10:00`,
    reason: '',
  });

  useEffect(() => {
    let active = true;
    // Carga inicial del equipo activo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiFetch<PaginatedResponse<Employee>>('/employees?pageSize=100&status=ACTIVE')
      .then((page) => {
        if (!active) return;
        setEmployees(page.items);
        setEmployeeId((current) => current || page.items[0]?.id || '');
      })
      .catch((cause) => {
        if (active) {
          setError(errorMessage(cause, 'No se pudo cargar el equipo'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadSchedule = useCallback(async () => {
    if (!employeeId) {
      setRules([]);
      setTimeOff([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ruleList, timeOffList] = await Promise.all([
        apiFetch<AvailabilityRule[]>(`/availability/employees/${employeeId}/rules`),
        apiFetch<TimeOff[]>(`/availability/employees/${employeeId}/time-off`),
      ]);
      setRules(
        ruleList.map((rule) => ({
          weekday: rule.weekday,
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
        })),
      );
      setTimeOff(timeOffList);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo cargar la disponibilidad del empleado'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    // Recarga reglas y bloqueos al cambiar de empleado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSchedule();
  }, [loadSchedule]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId) ?? null,
    [employees, employeeId],
  );

  function addRule(weekday: number): void {
    setSuccess(null);
    setRules((current) => [
      ...current,
      { weekday, startMinute: 9 * 60, endMinute: 18 * 60 },
    ]);
  }

  function updateRule(index: number, patch: Partial<RuleDraft>): void {
    setSuccess(null);
    setRules((current) =>
      current.map((rule, position) =>
        position === index ? { ...rule, ...patch } : rule,
      ),
    );
  }

  function removeRule(index: number): void {
    setSuccess(null);
    setRules((current) => current.filter((_, position) => position !== index));
  }

  async function saveRules(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!employeeId) return;

    const invalid = rules.find((rule) => rule.endMinute <= rule.startMinute);
    if (invalid) {
      setError('Cada intervalo debe terminar después de su hora de inicio');
      return;
    }

    setSavingRules(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/availability/employees/${employeeId}/rules`, {
        method: 'PUT',
        body: {
          rules: [...rules].sort(
            (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
          ),
        },
      });
      setSuccess('Horario semanal guardado');
      await loadSchedule();
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo guardar el horario'));
    } finally {
      setSavingRules(false);
    }
  }

  async function createTimeOff(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!employeeId) return;
    setCreatingTimeOff(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/availability/employees/${employeeId}/time-off`, {
        method: 'POST',
        body: {
          startsAt: localDateTimeToIso(timeOffForm.startsAt, timezone),
          endsAt: localDateTimeToIso(timeOffForm.endsAt, timezone),
          reason: timeOffForm.reason || undefined,
        },
      });
      setSuccess('Bloqueo agregado');
      setTimeOffForm({
        startsAt: `${todayInTimeZone(timezone)}T09:00`,
        endsAt: `${todayInTimeZone(timezone)}T10:00`,
        reason: '',
      });
      await loadSchedule();
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo crear el bloqueo'));
    } finally {
      setCreatingTimeOff(false);
    }
  }

  async function deleteTimeOff(block: TimeOff): Promise<void> {
    if (!window.confirm('¿Eliminar este bloqueo de disponibilidad?')) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/availability/time-off/${block.id}`, { method: 'DELETE' });
      setSuccess('Bloqueo eliminado');
      await loadSchedule();
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo eliminar el bloqueo'));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Disponibilidad
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Horario semanal y bloqueos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los horarios se interpretan en la zona {timezone}. Los turnos y bloqueos
          existentes siempre tienen prioridad sobre una regla.
        </p>
      </div>

      <Card className="mt-6">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="availability-employee">Empleado</Label>
            <Select
              id="availability-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              disabled={loading || employees.length === 0}
            >
              {employees.length === 0 ? <option value="">Sin empleados activos</option> : null}
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="outline" onClick={() => void loadSchedule()} loading={loading}>
            Recargar
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>No se pudo completar la operación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert variant="success" className="mt-6">
          <AlertTitle>Listo</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !selectedEmployee ? (
        <Alert variant="warning" className="mt-6">
          <AlertTitle>No hay empleados activos</AlertTitle>
          <AlertDescription>
            Crea o reactiva un empleado en Catálogo para definir su disponibilidad.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="mt-6 space-y-6">
          <form onSubmit={saveRules}>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Horario de {selectedEmployee.name}</CardTitle>
                  <CardDescription>
                    Agrega uno o varios intervalos por día. Los intervalos del mismo día
                    no pueden solaparse.
                  </CardDescription>
                </div>
                {canWrite ? (
                  <Button type="submit" loading={savingRules}>
                    Guardar horario
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {WEEKDAYS.map((label, weekday) => {
                  const dayRules = rules
                    .map((rule, index) => ({ rule, index }))
                    .filter(({ rule }) => rule.weekday === weekday);

                  return (
                    <div
                      key={weekday}
                      className="rounded-lg border bg-muted/20 p-3 sm:flex sm:items-start sm:gap-4"
                    >
                      <div className="flex w-28 items-center justify-between gap-2 sm:block">
                        <p className="text-sm font-medium">{label}</p>
                        {canWrite ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1"
                            onClick={() => addRule(weekday)}
                          >
                            + Intervalo
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-2 flex-1 space-y-2 sm:mt-0">
                        {dayRules.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Sin atención</p>
                        ) : (
                          dayRules.map(({ rule, index }) => (
                            <div key={index} className="flex flex-wrap items-center gap-2">
                              <Input
                                type="time"
                                step={900}
                                className="w-32"
                                value={minutesToTime(rule.startMinute)}
                                disabled={!canWrite}
                                onChange={(event) =>
                                  updateRule(index, {
                                    startMinute: timeToMinutes(event.target.value),
                                  })
                                }
                              />
                              <span className="text-sm text-muted-foreground">a</span>
                              <Input
                                type="time"
                                step={900}
                                className="w-32"
                                value={minutesToTime(rule.endMinute)}
                                disabled={!canWrite}
                                onChange={(event) =>
                                  updateRule(index, {
                                    endMinute: timeToMinutes(event.target.value),
                                  })
                                }
                              />
                              {canWrite ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => removeRule(index)}
                                >
                                  Quitar
                                </Button>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </form>

          <Card>
            <CardHeader>
              <CardTitle>Bloqueos puntuales</CardTitle>
              <CardDescription>
                Vacaciones, capacitación o ausencias que bloquean la agenda de este
                empleado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canWrite ? (
                <form
                  onSubmit={createTimeOff}
                  className="grid gap-3 rounded-lg border bg-muted/30 p-4 md:grid-cols-2"
                >
                  <div className="space-y-2">
                    <Label htmlFor="time-off-start">Inicio</Label>
                    <Input
                      id="time-off-start"
                      type="datetime-local"
                      required
                      value={timeOffForm.startsAt}
                      onChange={(event) =>
                        setTimeOffForm({ ...timeOffForm, startsAt: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time-off-end">Fin</Label>
                    <Input
                      id="time-off-end"
                      type="datetime-local"
                      required
                      value={timeOffForm.endsAt}
                      onChange={(event) =>
                        setTimeOffForm({ ...timeOffForm, endsAt: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="time-off-reason">Motivo</Label>
                    <Textarea
                      id="time-off-reason"
                      maxLength={240}
                      value={timeOffForm.reason}
                      onChange={(event) =>
                        setTimeOffForm({ ...timeOffForm, reason: event.target.value })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" loading={creatingTimeOff}>
                      Agregar bloqueo
                    </Button>
                  </div>
                </form>
              ) : null}

              {timeOff.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin bloqueos puntuales para este empleado.
                </p>
              ) : (
                <div className="space-y-2">
                  {timeOff.map((block) => (
                    <div
                      key={block.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {formatDateTime(block.startsAt, timezone)} →{' '}
                          {formatDateTime(block.endsAt, timezone)}
                        </p>
                        {block.reason ? (
                          <p className="text-xs text-muted-foreground">{block.reason}</p>
                        ) : null}
                      </div>
                      {canWrite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => void deleteTimeOff(block)}
                        >
                          Eliminar
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
