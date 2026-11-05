'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type {
  Appointment,
  HealthResponse,
  PaginatedResponse,
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
  Skeleton,
  Separator,
  buttonVariants,
} from '@turnopro/ui';
import {
  addDaysToDateKey,
  todayInTimeZone,
  zonedDateTimeToUtc,
} from '@turnopro/shared';

import { useAuth } from '@/components/providers/auth-provider';
import { API_BASE_URL, apiFetch, ApiError } from '@/lib/api';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  STAFF: 'Colaborador',
};

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

function formatDate(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
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

function healthBadgeVariant(status: string): 'success' | 'warning' | 'destructive' {
  if (status === 'ok') return 'success';
  if (status === 'degraded') return 'warning';
  return 'destructive';
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function DashboardView() {
  const { session, hasPermission } = useAuth();
  const timezone = session?.organization.timezone ?? 'America/Mexico_City';
  const currency = session?.organization.currency ?? 'MXN';
  const canReadReports = hasPermission('reports:read');
  const canReadAppointments = hasPermission('appointments:read');

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(true);

  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const response = await fetch(`${API_BASE_URL}/health/ready`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = (await response.json()) as HealthResponse;
      setHealth(payload);
      setHealthError(response.ok ? null : `La API respondió con estado ${response.status}.`);
    } catch {
      setHealth(null);
      setHealthError('No se pudo contactar el endpoint de salud de la API.');
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    if (!canReadReports) {
      setLoadingSummary(false);
      return;
    }

    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const today = todayInTimeZone(timezone);
      const query = new URLSearchParams({
        from: zonedDateTimeToUtc(addDaysToDateKey(today, -6), 0, timezone).toISOString(),
        to: zonedDateTimeToUtc(addDaysToDateKey(today, 1), 0, timezone).toISOString(),
      });
      setSummary(
        await apiFetch<ReportsSummary>(`/reports/summary?${query.toString()}`),
      );
    } catch (cause) {
      setSummary(null);
      setSummaryError(errorMessage(cause, 'No se pudieron cargar las métricas.'));
    } finally {
      setLoadingSummary(false);
    }
  }, [canReadReports, timezone]);

  const loadUpcoming = useCallback(async () => {
    if (!canReadAppointments) {
      setLoadingUpcoming(false);
      return;
    }

    setLoadingUpcoming(true);
    setUpcomingError(null);
    try {
      const today = todayInTimeZone(timezone);
      const query = new URLSearchParams({
        from: new Date().toISOString(),
        to: zonedDateTimeToUtc(addDaysToDateKey(today, 1), 0, timezone).toISOString(),
        pageSize: '50',
      });
      const page = await apiFetch<PaginatedResponse<Appointment>>(
        `/appointments?${query.toString()}`,
      );
      setUpcoming(
        page.items
          .filter(
            (appointment) =>
              appointment.status === 'PENDING' || appointment.status === 'CONFIRMED',
          )
          .slice(0, 6),
      );
    } catch (cause) {
      setUpcoming([]);
      setUpcomingError(errorMessage(cause, 'No se pudieron cargar los próximos turnos.'));
    } finally {
      setLoadingUpcoming(false);
    }
  }, [canReadAppointments, timezone]);

  useEffect(() => {
    // Sincronización con sistemas externos (API de salud y reportes).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHealth();
    const interval = window.setInterval(() => void loadHealth(), 30_000);
    return () => window.clearInterval(interval);
  }, [loadHealth]);

  useEffect(() => {
    // Carga de métricas y agenda al entrar al panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSummary();
    void loadUpcoming();
  }, [loadSummary, loadUpcoming]);

  if (!session) {
    return null;
  }

  const { organization, membership, user } = session;
  const canReadTeam = hasPermission('members:read');
  const canUpdateOrganization = hasPermission('organization:update');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Panel</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Hola, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Resumen operativo de {organization.name} para los últimos 7 días y los
            turnos que vienen hoy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/agenda" className={buttonVariants({ variant: 'default', size: 'sm' })}>
            Ir a la agenda
          </Link>
          {canReadReports ? (
            <Link
              href="/reports"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Ver reportes
            </Link>
          ) : null}
          {canReadTeam ? (
            <Link href="/team" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Ver equipo
            </Link>
          ) : null}
          {canUpdateOrganization ? (
            <Link
              href="/settings"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Configurar organización
            </Link>
          ) : null}
        </div>
      </header>

      {canReadReports ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Últimos 7 días
            </h2>
            <Badge variant="secondary">
              {ROLE_LABELS[membership.role] ?? membership.role}
            </Badge>
          </div>

          {summaryError ? (
            <Alert variant="destructive">
              <AlertTitle>Sin métricas</AlertTitle>
              <AlertDescription>{summaryError}</AlertDescription>
            </Alert>
          ) : loadingSummary && !summary ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          ) : summary ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Turnos"
                value={String(summary.totals.appointments)}
                hint={`${summary.totals.pending} pendientes · ${summary.totals.confirmed} confirmados`}
              />
              <Metric
                label="Completados"
                value={String(summary.totals.completed)}
                hint={`No-show ${formatPercent(summary.totals.noShowRate)}`}
              />
              <Metric
                label="Ingresos"
                value={formatMoney(summary.totals.revenueCents, currency)}
                hint="Solo turnos completados"
                tone="success"
              />
              <Metric
                label="Cancelaciones"
                value={String(summary.totals.cancelled)}
                hint={`Tasa ${formatPercent(summary.totals.cancellationRate)}`}
                tone="destructive"
              />
            </div>
          ) : null}
        </section>
      ) : (
        <Alert variant="warning">
          <AlertTitle>Métricas restringidas</AlertTitle>
          <AlertDescription>
            Tu rol no incluye <code>reports:read</code>. El panel muestra solo la agenda
            del día.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Próximos turnos de hoy</CardTitle>
              <CardDescription>
                Pendientes y confirmados desde ahora hasta el final del día.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={loadingUpcoming}
              onClick={() => void loadUpcoming()}
            >
              Actualizar
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingError ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo cargar la agenda</AlertTitle>
                <AlertDescription>{upcomingError}</AlertDescription>
              </Alert>
            ) : loadingUpcoming && upcoming.length === 0 ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No quedan turnos pendientes para hoy.
              </p>
            ) : (
              upcoming.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3"
                >
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
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado de la plataforma</CardTitle>
            <CardDescription>Comprobaciones contra PostgreSQL y Redis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkingHealth && !health ? (
              <Skeleton className="h-24 w-full" />
            ) : health ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={healthBadgeVariant(health.status)}>{health.status}</Badge>
                  <span className="text-xs text-muted-foreground">v{health.version}</span>
                </div>
                <dl className="space-y-2 text-sm">
                  {Object.entries(health.checks ?? {}).map(([name, check]) => (
                    <div key={name} className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground capitalize">{name}</dt>
                      <dd className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {check.latencyMs !== undefined ? `${check.latencyMs} ms` : ''}
                        </span>
                        <Badge variant={check.status === 'up' ? 'success' : 'destructive'}>
                          {check.status}
                        </Badge>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Sin datos de salud</AlertTitle>
                <AlertDescription>
                  {healthError ?? 'La API no respondió a la comprobación.'}
                </AlertDescription>
              </Alert>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              loading={checkingHealth}
              onClick={() => void loadHealth()}
            >
              Volver a comprobar
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organización</CardTitle>
          <CardDescription>Datos vigentes de la sesión autenticada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Identificador
              </dt>
              <dd className="mt-1 font-mono text-sm">{organization.slug}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Estado
              </dt>
              <dd className="mt-1">
                <Badge variant={organization.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {organization.status}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Zona horaria
              </dt>
              <dd className="mt-1 text-sm">{organization.timezone}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Moneda
              </dt>
              <dd className="mt-1 text-sm">{organization.currency}</dd>
            </div>
          </dl>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Tu rol: </span>
              <Badge variant="secondary">
                {ROLE_LABELS[membership.role] ?? membership.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {membership.permissions.length} permisos efectivos · creada el{' '}
              {formatDate(organization.createdAt, organization.timezone)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'success' | 'destructive';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            tone === 'success'
              ? 'text-3xl text-emerald-600'
              : tone === 'destructive'
                ? 'text-3xl text-red-600'
                : 'text-3xl'
          }
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
