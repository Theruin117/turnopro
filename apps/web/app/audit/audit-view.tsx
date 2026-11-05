'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AuditLogEntry, PaginatedResponse } from '@turnopro/contracts';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@turnopro/ui';
import { addDaysToDateKey, zonedDateTimeToUtc } from '@turnopro/shared';

import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch, ApiError } from '@/lib/api';

const PAGE_SIZE = 20;

const ENTITIES = [
  'appointment',
  'client',
  'employee',
  'membership',
  'organization',
  'refresh_token',
  'refresh_token_family',
  'service',
  'time_off',
] as const;

const ACTIONS = [
  'appointment.cancelled',
  'appointment.created',
  'appointment.rescheduled',
  'appointment.status_changed',
  'auth.login',
  'auth.logout',
  'auth.refresh_reuse_detected',
  'auth.register',
  'availability.rules_replaced',
  'availability.time_off_created',
  'availability.time_off_deleted',
  'client.archived',
  'client.created',
  'client.updated',
  'employee.archived',
  'employee.created',
  'employee.updated',
  'member.updated',
  'organization.updated',
  'service.archived',
  'service.created',
  'service.updated',
] as const;

const ACTION_LABELS: Record<string, string> = {
  'appointment.cancelled': 'Turno cancelado',
  'appointment.created': 'Turno creado',
  'appointment.rescheduled': 'Turno reprogramado',
  'appointment.status_changed': 'Estado de turno cambiado',
  'auth.login': 'Inicio de sesión',
  'auth.logout': 'Cierre de sesión',
  'auth.refresh_reuse_detected': 'Reutilización de refresh detectada',
  'auth.register': 'Registro de organización',
  'availability.rules_replaced': 'Horarios semanales actualizados',
  'availability.time_off_created': 'Bloqueo creado',
  'availability.time_off_deleted': 'Bloqueo eliminado',
  'client.archived': 'Cliente archivado',
  'client.created': 'Cliente creado',
  'client.updated': 'Cliente actualizado',
  'employee.archived': 'Empleado archivado',
  'employee.created': 'Empleado creado',
  'employee.updated': 'Empleado actualizado',
  'member.updated': 'Miembro actualizado',
  'organization.updated': 'Organización actualizada',
  'service.archived': 'Servicio archivado',
  'service.created': 'Servicio creado',
  'service.updated': 'Servicio actualizado',
};

const ENTITY_LABELS: Record<string, string> = {
  appointment: 'Turno',
  client: 'Cliente',
  employee: 'Empleado',
  membership: 'Membresía',
  organization: 'Organización',
  refresh_token: 'Token de sesión',
  refresh_token_family: 'Familia de tokens',
  service: 'Servicio',
  time_off: 'Bloqueo',
};

interface DraftFilters {
  entity: string;
  action: string;
  fromKey: string;
  toKey: string;
}

const EMPTY_FILTERS: DraftFilters = {
  entity: '',
  action: '',
  fromKey: '',
  toKey: '',
};

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

function describeMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata || Object.keys(metadata).length === 0) return '—';
  return JSON.stringify(metadata);
}

export function AuditView() {
  const { session, hasPermission } = useAuth();
  const timezone = session?.organization.timezone ?? 'America/Mexico_City';
  const canRead = hasPermission('audit:read');

  const [draft, setDraft] = useState<DraftFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<DraftFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<AuditLogEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, active: DraftFilters) => {
      if (!canRead) {
        setLoading(false);
        return;
      }

      if (
        active.fromKey &&
        active.toKey &&
        active.fromKey > active.toKey
      ) {
        setError('La fecha inicial no puede ser posterior a la fecha final.');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        if (active.entity) query.set('entity', active.entity);
        if (active.action) query.set('action', active.action);
        if (active.fromKey) {
          query.set(
            'from',
            zonedDateTimeToUtc(active.fromKey, 0, timezone).toISOString(),
          );
        }
        if (active.toKey) {
          query.set(
            'to',
            zonedDateTimeToUtc(
              addDaysToDateKey(active.toKey, 1),
              0,
              timezone,
            ).toISOString(),
          );
        }

        setData(
          await apiFetch<PaginatedResponse<AuditLogEntry>>(
            `/audit?${query.toString()}`,
          ),
        );
      } catch (cause) {
        setData(null);
        setError(errorMessage(cause, 'No se pudo cargar la auditoría.'));
      } finally {
        setLoading(false);
      }
    },
    [canRead, timezone],
  );

  useEffect(() => {
    // Recarga al cambiar de página o de filtros aplicados.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(page, filters);
  }, [load, page, filters]);

  function applyFilters(): void {
    setPage(1);
    setFilters({ ...draft });
  }

  function clearFilters(): void {
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setFilters({ ...EMPTY_FILTERS });
  }

  if (!session) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Auditoría
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Actividad de {session.organization.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Eventos de negocio registrados por la organización, del más reciente al más
            antiguo.
          </p>
        </div>
        {data ? (
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? 'evento' : 'eventos'}
          </p>
        ) : null}
      </header>

      {!canRead ? (
        <Alert variant="warning">
          <AlertTitle>Sin acceso a auditoría</AlertTitle>
          <AlertDescription>
            Tu rol no incluye el permiso <code>audit:read</code>. La API también
            rechazaría esta consulta con 403.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>
                Los filtros se combinan entre sí y con el rango de fechas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="audit-entity">Entidad</Label>
                  <Select
                    id="audit-entity"
                    value={draft.entity}
                    onChange={(event) =>
                      setDraft({ ...draft, entity: event.target.value })
                    }
                  >
                    <option value="">Todas</option>
                    {ENTITIES.map((entity) => (
                      <option key={entity} value={entity}>
                        {ENTITY_LABELS[entity] ?? entity}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audit-action">Acción</Label>
                  <Select
                    id="audit-action"
                    value={draft.action}
                    onChange={(event) =>
                      setDraft({ ...draft, action: event.target.value })
                    }
                  >
                    <option value="">Todas</option>
                    {ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {ACTION_LABELS[action] ?? action}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audit-from">Desde</Label>
                  <Input
                    id="audit-from"
                    type="date"
                    value={draft.fromKey}
                    max={draft.toKey || undefined}
                    onChange={(event) =>
                      setDraft({ ...draft, fromKey: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audit-to">Hasta</Label>
                  <Input
                    id="audit-to"
                    type="date"
                    value={draft.toKey}
                    min={draft.fromKey || undefined}
                    onChange={(event) =>
                      setDraft({ ...draft, toKey: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button loading={loading} onClick={applyFilters}>
                  Filtrar
                </Button>
                <Button variant="ghost" onClick={clearFilters}>
                  Limpiar
                </Button>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo cargar la auditoría</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Eventos</CardTitle>
              <CardDescription>
                El detalle no incluye tokens, contraseñas ni cuerpos completos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && !data ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : data && data.items.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Acción</TableHead>
                          <TableHead>Entidad</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Detalle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.items.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {new Intl.DateTimeFormat('es-MX', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                                timeZone: timezone,
                              }).format(new Date(entry.createdAt))}
                            </TableCell>
                            <TableCell className="font-medium">
                              {ACTION_LABELS[entry.action] ?? entry.action}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {ENTITY_LABELS[entry.entity] ?? entry.entity}
                              </Badge>
                              {entry.entityId ? (
                                <span className="mt-1 block max-w-40 truncate font-mono text-[10px] text-muted-foreground">
                                  {entry.entityId}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {entry.actor ? (
                                <>
                                  <span className="block text-sm text-foreground">
                                    {entry.actor.name}
                                  </span>
                                  <span className="block text-xs">
                                    {entry.actor.email}
                                  </span>
                                </>
                              ) : (
                                'Sistema'
                              )}
                            </TableCell>
                            <TableCell className="max-w-72">
                              <code
                                title={describeMetadata(entry.metadata)}
                                className="block truncate text-[11px] text-muted-foreground"
                              >
                                {describeMetadata(entry.metadata)}
                              </code>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground">
                      Página {data.page} de {Math.max(data.totalPages, 1)}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || loading}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= data.totalPages || loading}
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hay eventos que coincidan con los filtros.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
