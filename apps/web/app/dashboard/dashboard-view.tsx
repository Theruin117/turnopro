'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { HealthResponse } from '@turnopro/contracts';
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

import { useAuth } from '@/components/providers/auth-provider';
import { API_BASE_URL } from '@/lib/api';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  STAFF: 'Colaborador',
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

function healthBadgeVariant(status: string): 'success' | 'warning' | 'destructive' {
  if (status === 'ok') return 'success';
  if (status === 'degraded') return 'warning';
  return 'destructive';
}

export function DashboardView() {
  const { session, hasPermission } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(true);

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

  useEffect(() => {
    void loadHealth();
    const interval = window.setInterval(() => void loadHealth(), 30_000);
    return () => window.clearInterval(interval);
  }, [loadHealth]);

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
            Esta base ya aplica aislamiento por organización, sesiones rotativas y
            autorización por rol. Los módulos de agenda se construirán sobre estas mismas
            garantías.
          </p>
        </div>
        <div className="flex gap-2">
          {canUpdateOrganization ? (
            <Link
              href="/settings"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Configurar organización
            </Link>
          ) : null}
          {canReadTeam ? (
            <Link href="/team" className={buttonVariants({ variant: 'default', size: 'sm' })}>
              Ver equipo
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{organization.name}</CardTitle>
            <CardDescription>
              Datos vigentes de la organización extraídos de la sesión autenticada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Identificador
                </dt>
                <dd className="mt-1 font-mono text-sm">{organization.slug}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Estado
                </dt>
                <dd className="mt-1">
                  <Badge variant={organization.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {organization.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Zona horaria
                </dt>
                <dd className="mt-1 text-sm">{organization.timezone}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Moneda
                </dt>
                <dd className="mt-1 text-sm">{organization.currency}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Creada
                </dt>
                <dd className="mt-1 text-sm">
                  {formatDate(organization.createdAt, organization.timezone)}
                </dd>
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
                {membership.permissions.length} permisos efectivos en esta organización.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado de la plataforma</CardTitle>
            <CardDescription>Comprobaciones reales contra PostgreSQL y Redis.</CardDescription>
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Sesión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Access token de corta duración en memoria.</p>
            <p>Refresh token opaco, httpOnly y con rotación de familia.</p>
            <p>
              Tu sesión expira a los {Math.round(session.expiresIn / 60)} minutos y se
              renueva sin recargar la página.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Autorización</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>El tenant se deriva del token, nunca del cuerpo de la solicitud.</p>
            <p>La membresía se revalida en cada petición contra la base de datos.</p>
            <p>Los permisos se calculan a partir del rol asignado.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Próximo módulo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Catálogo de servicios, empleados y horarios.</p>
            <p>
              Las reservas usarán transacciones serializables, bloqueo por rango y claves
              de idempotencia.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
