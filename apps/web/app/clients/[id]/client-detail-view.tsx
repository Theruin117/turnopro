'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type {
  Appointment,
  Client,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from '@turnopro/ui';

import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch, ApiError } from '@/lib/api';

const PAGE_SIZE = 10;

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

export function ClientDetailView({ clientId }: { clientId: string }) {
  const { session } = useAuth();
  const timezone = session?.organization.timezone ?? 'America/Mexico_City';
  const currency = session?.organization.currency ?? 'MXN';

  const [client, setClient] = useState<Client | null>(null);
  const [history, setHistory] = useState<PaginatedResponse<Appointment> | null>(null);
  const [page, setPage] = useState(1);
  const [loadingClient, setLoadingClient] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClient = useCallback(async () => {
    setLoadingClient(true);
    setError(null);
    try {
      setClient(await apiFetch<Client>(`/clients/${clientId}`));
    } catch (cause) {
      setClient(null);
      setError(errorMessage(cause, 'No se pudo cargar el cliente.'));
    } finally {
      setLoadingClient(false);
    }
  }, [clientId]);

  const loadHistory = useCallback(
    async (targetPage: number) => {
      setLoadingHistory(true);
      try {
        const query = new URLSearchParams({
          clientId,
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        setHistory(
          await apiFetch<PaginatedResponse<Appointment>>(
            `/appointments?${query.toString()}`,
          ),
        );
      } catch (cause) {
        setHistory(null);
        setError(errorMessage(cause, 'No se pudo cargar el historial del cliente.'));
      } finally {
        setLoadingHistory(false);
      }
    },
    [clientId],
  );

  useEffect(() => {
    // Carga inicial del cliente y de su historial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClient();
  }, [loadClient]);

  useEffect(() => {
    // Sincroniza el historial con la página activa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory(page);
  }, [loadHistory, page]);

  if (!session) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Cliente
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {client?.name ?? 'Ficha del cliente'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Datos e historial dentro de {session.organization.name}.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/catalog"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Volver al catálogo
          </Link>
          {client ? (
            <Link
              href={`/agenda?clientId=${client.id}`}
              className={buttonVariants({ variant: 'default', size: 'sm' })}
            >
              Reservar turno
            </Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo completar la operación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loadingClient ? (
        <Skeleton className="h-48 w-full" />
      ) : client ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Datos de contacto</CardTitle>
              <CardDescription>
                El archivo del cliente conserva sus turnos históricos.
              </CardDescription>
            </div>
            <Badge variant={client.status === 'ACTIVE' ? 'success' : 'secondary'}>
              {client.status === 'ACTIVE' ? 'Activo' : 'Archivado'}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Correo
              </p>
              <p className="mt-1 text-sm">{client.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Teléfono
              </p>
              <p className="mt-1 text-sm">{client.phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Alta
              </p>
              <p className="mt-1 text-sm">
                {new Intl.DateTimeFormat('es-MX', {
                  dateStyle: 'medium',
                  timeZone: timezone,
                }).format(new Date(client.createdAt))}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Última actualización
              </p>
              <p className="mt-1 text-sm">
                {new Intl.DateTimeFormat('es-MX', {
                  dateStyle: 'medium',
                  timeZone: timezone,
                }).format(new Date(client.updatedAt))}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Notas
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">
                {client.notes ?? 'Sin notas registradas.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Historial de turnos</CardTitle>
            <CardDescription>
              {history
                ? `${history.total} ${history.total === 1 ? 'turno' : 'turnos'} registrados`
                : 'Cargando historial'}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={loadingHistory}
            onClick={() => void loadHistory(page)}
          >
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingHistory && !history ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : history && history.items.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.items.map((appointment) => (
                    <TableRow key={appointment.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Intl.DateTimeFormat('es-MX', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: timezone,
                        }).format(new Date(appointment.startAt))}
                      </TableCell>
                      <TableCell className="font-medium">
                        {appointment.service.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {appointment.employee.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[appointment.status]}>
                          {STATUS_LABELS[appointment.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat('es-MX', {
                          style: 'currency',
                          currency,
                          maximumFractionDigits: 0,
                        }).format(appointment.service.priceCents / 100)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">
                  Página {history.page} de {Math.max(history.totalPages, 1)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loadingHistory}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= history.totalPages || loadingHistory}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este cliente todavía no tiene turnos registrados.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
