'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import type { AuthOrganization } from '@turnopro/contracts';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Skeleton,
  buttonVariants,
} from '@turnopro/ui';

import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch, ApiError } from '@/lib/api';

const CURRENCIES = ['MXN', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN', 'BRL'];
const TIMEZONES = [
  'America/Mexico_City',
  'America/Monterrey',
  'America/Cancun',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'America/New_York',
  'Europe/Madrid',
];

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsView />
    </RequireAuth>
  );
}

function SettingsView() {
  const { session, hasPermission, updateOrganization } = useAuth();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [currency, setCurrency] = useState('MXN');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (session) {
      setName(session.organization.name);
      setTimezone(session.organization.timezone);
      setCurrency(session.organization.currency);
    }
  }, [session]);

  if (!session) {
    return null;
  }

  const canUpdate = hasPermission('organization:update');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!session) return;

    const changes: Record<string, string> = {};
    if (name.trim() !== session.organization.name) changes.name = name.trim();
    if (timezone.trim() !== session.organization.timezone) changes.timezone = timezone.trim();
    if (currency !== session.organization.currency) changes.currency = currency;

    if (Object.keys(changes).length === 0) {
      setError('No hay cambios que guardar.');
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<AuthOrganization>('/organizations/current', {
        method: 'PATCH',
        body: changes,
      });
      updateOrganization(updated);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'No se pudo actualizar la organización.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Organización</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Configuración</h1>
          <p className="mt-2 text-muted-foreground">
            Nombre, zona horaria y moneda. Los cambios se auditan y se reflejan en tu
            sesión.
          </p>
        </div>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Volver al panel
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
          <CardDescription>
            El identificador es inmutable porque forma parte de la URL de acceso.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Identificador</Label>
            <Input value={session.organization.slug} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>Estado</Label>
            <div className="flex h-10 items-center">
              <Badge variant={session.organization.status === 'ACTIVE' ? 'success' : 'warning'}>
                {session.organization.status}
              </Badge>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Creada</Label>
            <p className="text-sm text-muted-foreground">
              {new Intl.DateTimeFormat('es-MX', {
                dateStyle: 'long',
                timeStyle: 'short',
                timeZone: session.organization.timezone,
              }).format(new Date(session.organization.createdAt))}
            </p>
          </div>
        </CardContent>
      </Card>

      {!canUpdate ? (
        <Alert variant="warning">
          <AlertTitle>Permiso insuficiente</AlertTitle>
          <AlertDescription>
            Tu rol actual puede consultar la organización, pero no modificarla. Solicita a un
            administrador o propietario el cambio.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos operativos</CardTitle>
          <CardDescription>
            La zona horaria y la moneda se usarán en agenda, reportes y facturación.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del negocio</Label>
              <Input
                id="name"
                value={name}
                minLength={2}
                maxLength={80}
                required
                disabled={!canUpdate}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="timezone">Zona horaria IANA</Label>
                <Input
                  id="timezone"
                  list="timezone-options"
                  value={timezone}
                  required
                  disabled={!canUpdate}
                  onChange={(event) => {
                    setTimezone(event.target.value);
                    setSaved(false);
                  }}
                />
                <datalist id="timezone-options">
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select
                  id="currency"
                  value={currency}
                  disabled={!canUpdate}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setSaved(false);
                  }}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo guardar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {saved ? (
              <Alert variant="success">
                <AlertTitle>Cambios guardados</AlertTitle>
                <AlertDescription>
                  La organización y tu sesión ya muestran los nuevos datos.
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>

          <CardFooter className="flex items-center justify-between gap-3 border-t pt-6">
            <p className="text-xs text-muted-foreground">
              Los cambios quedan registrados en la bitácora de auditoría.
            </p>
            <Button type="submit" loading={saving} disabled={!canUpdate}>
              Guardar cambios
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-10 sm:px-6">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
