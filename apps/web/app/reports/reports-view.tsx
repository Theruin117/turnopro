'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  DailyReportRow,
  ReportsSummary,
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
  Label,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@turnopro/ui';
import {
  addDaysToDateKey,
  formatDateKeyInTimeZone,
  todayInTimeZone,
  zonedDateTimeToUtc,
} from '@turnopro/shared';

import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch, ApiError } from '@/lib/api';

type Preset = '7d' | '30d' | '90d' | 'custom';

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '90 días' },
  { id: 'custom', label: 'Personalizado' },
];

const PRESET_DAYS: Record<Exclude<Preset, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function formatDateKey(dateKey: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

export function ReportsView() {
  const { session, hasPermission } = useAuth();
  const timezone = session?.organization.timezone ?? 'America/Mexico_City';
  const currency = session?.organization.currency ?? 'MXN';
  const canRead = hasPermission('reports:read');

  const [preset, setPreset] = useState<Preset>('30d');
  const [fromKey, setFromKey] = useState(() =>
    addDaysToDateKey(todayInTimeZone(timezone), -6),
  );
  const [toKey, setToKey] = useState(() => todayInTimeZone(timezone));
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolveRange = useCallback(
    (nextPreset: Preset, nextFromKey: string, nextToKey: string) => {
      if (nextPreset === 'custom') {
        const from = zonedDateTimeToUtc(nextFromKey, 0, timezone);
        const to = zonedDateTimeToUtc(addDaysToDateKey(nextToKey, 1), 0, timezone);
        return { from, to };
      }

      const today = todayInTimeZone(timezone);
      const days = PRESET_DAYS[nextPreset];
      const from = zonedDateTimeToUtc(addDaysToDateKey(today, -(days - 1)), 0, timezone);
      const to = zonedDateTimeToUtc(addDaysToDateKey(today, 1), 0, timezone);
      return { from, to };
    },
    [timezone],
  );

  const load = useCallback(
    async (nextPreset: Preset, nextFromKey: string, nextToKey: string) => {
      if (!canRead) {
        setLoading(false);
        return;
      }

      if (nextPreset === 'custom' && nextFromKey > nextToKey) {
        setError('La fecha inicial no puede ser posterior a la fecha final.');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { from, to } = resolveRange(nextPreset, nextFromKey, nextToKey);
        const query = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
        });
        setSummary(
          await apiFetch<ReportsSummary>(`/reports/summary?${query.toString()}`),
        );
      } catch (cause) {
        setSummary(null);
        setError(errorMessage(cause, 'No se pudo cargar el resumen de reportes.'));
      } finally {
        setLoading(false);
      }
    },
    [canRead, resolveRange],
  );

  useEffect(() => {
    // Sincroniza el resumen con el rango activo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(preset, fromKey, toKey);
  }, [load, preset, fromKey, toKey]);

  const rangeLabel = useMemo(() => {
    if (!summary) return '';
    const from = formatDateKeyInTimeZone(new Date(summary.range.from), timezone);
    const to = formatDateKeyInTimeZone(
      new Date(new Date(summary.range.to).getTime() - 1),
      timezone,
    );
    return from === to ? formatDateKey(from) : `${formatDateKey(from)} – ${formatDateKey(to)}`;
  }, [summary, timezone]);

  if (!session) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Reportes
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Operación de {session.organization.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cifras calculadas por la API en la zona horaria {timezone}.
          </p>
        </div>
        {summary ? (
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        ) : null}
      </header>

      {!canRead ? (
        <Alert variant="warning">
          <AlertTitle>Sin acceso a reportes</AlertTitle>
          <AlertDescription>
            Tu rol no incluye el permiso <code>reports:read</code>. La API también
            rechazaría esta consulta con 403.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Rango</CardTitle>
              <CardDescription>
                El máximo permitido por la API es de 366 días.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((option) => (
                  <Button
                    key={option.id}
                    variant={preset === option.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      if (option.id !== 'custom') {
                        const today = todayInTimeZone(timezone);
                        setFromKey(addDaysToDateKey(today, -(PRESET_DAYS[option.id] - 1)));
                        setToKey(today);
                      }
                      setPreset(option.id);
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              {preset === 'custom' ? (
                <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="reports-from">Desde</Label>
                    <Input
                      id="reports-from"
                      type="date"
                      value={fromKey}
                      max={toKey}
                      onChange={(event) => setFromKey(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reports-to">Hasta</Label>
                    <Input
                      id="reports-to"
                      type="date"
                      value={toKey}
                      min={fromKey}
                      onChange={(event) => setToKey(event.target.value)}
                    />
                  </div>
                  <Button
                    loading={loading}
                    onClick={() => void load(preset, fromKey, toKey)}
                  >
                    Aplicar
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo cargar el resumen</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading && !summary ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          ) : summary ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Turnos"
                  value={String(summary.totals.appointments)}
                  hint={`${summary.totals.pending} pendientes · ${summary.totals.confirmed} confirmados`}
                />
                <KpiCard
                  label="Completados"
                  value={String(summary.totals.completed)}
                  hint={`${formatPercent(
                    summary.totals.appointments > 0
                      ? summary.totals.completed / summary.totals.appointments
                      : 0,
                  )} del total`}
                />
                <KpiCard
                  label="Cancelaciones"
                  value={String(summary.totals.cancelled)}
                  hint={`Tasa ${formatPercent(summary.totals.cancellationRate)}`}
                  tone="destructive"
                />
                <KpiCard
                  label="Ingresos"
                  value={formatMoney(summary.totals.revenueCents, currency)}
                  hint="Solo turnos completados"
                  tone="success"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard
                  label="No-show"
                  value={String(summary.totals.noShow)}
                  hint={`Tasa ${formatPercent(summary.totals.noShowRate)}`}
                  tone="warning"
                />
                <KpiCard
                  label="Empleados con actividad"
                  value={String(
                    summary.byEmployee.filter((row) => row.appointments > 0).length,
                  )}
                  hint={`${summary.byEmployee.length} en el período`}
                />
                <KpiCard
                  label="Días con turnos"
                  value={String(summary.byDay.length)}
                  hint="Agrupados por fecha local"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Por empleado</CardTitle>
                  <CardDescription>
                    Ocupación calculada sobre las reglas horarias menos bloqueos.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {summary.byEmployee.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay empleados para el rango seleccionado.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empleado</TableHead>
                          <TableHead className="text-right">Turnos</TableHead>
                          <TableHead className="text-right">Completados</TableHead>
                          <TableHead className="text-right">Ocupación</TableHead>
                          <TableHead className="text-right">Horas reservadas</TableHead>
                          <TableHead className="text-right">Ingresos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.byEmployee.map((row) => (
                          <TableRow key={row.employeeId}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell className="text-right">{row.appointments}</TableCell>
                            <TableCell className="text-right">{row.completed}</TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant={
                                  row.occupancyRate >= 0.7
                                    ? 'success'
                                    : row.occupancyRate >= 0.35
                                      ? 'warning'
                                      : 'secondary'
                                }
                              >
                                {formatPercent(row.occupancyRate)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatMinutes(row.bookedMinutes)}
                              <span className="block text-xs">
                                de {formatMinutes(row.availableMinutes)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(row.revenueCents, currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Por día</CardTitle>
                  <CardDescription>
                    Turnos e ingresos agrupados por la fecha local del inicio.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {summary.byDay.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin turnos en el rango seleccionado.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-right">Turnos</TableHead>
                          <TableHead className="text-right">Ingresos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.byDay.map((row) => (
                          <DailyRow
                            key={row.date}
                            row={row}
                            currency={currency}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            'text-3xl',
            tone === 'success' && 'text-emerald-600',
            tone === 'warning' && 'text-amber-600',
            tone === 'destructive' && 'text-red-600',
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function DailyRow({ row, currency }: { row: DailyReportRow; currency: string }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{formatDateKey(row.date)}</TableCell>
      <TableCell className="text-right">{row.appointments}</TableCell>
      <TableCell className="text-right">{formatMoney(row.revenueCents, currency)}</TableCell>
    </TableRow>
  );
}
