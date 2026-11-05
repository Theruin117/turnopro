'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type {
  MembershipListItem,
  PaginatedResponse,
  UpdateMemberInput,
} from '@turnopro/contracts';
import { ROLES, type Role } from '@turnopro/shared';
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
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from '@turnopro/ui';

import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch, ApiError } from '@/lib/api';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  STAFF: 'Colaborador',
};

const ROLE_ORDER = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

const PAGE_SIZE = 20;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export default function TeamPage() {
  return (
    <RequireAuth>
      <TeamView />
    </RequireAuth>
  );
}

function TeamView() {
  const { session, hasPermission } = useAuth();
  const [members, setMembers] = useState<PaginatedResponse<MembershipListItem> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MembershipListItem | null>(null);
  const [draftRole, setDraftRole] = useState<Role>('STAFF');
  const [draftStatus, setDraftStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canRead = hasPermission('members:read');
  const canUpdate = hasPermission('members:update');
  const isOwner = session?.membership.role === 'OWNER';

  const activeOwners =
    members?.items.filter(
      (member) => member.role === 'OWNER' && member.status === 'ACTIVE',
    ).length ?? 0;

  function isLastActiveOwner(member: MembershipListItem): boolean {
    return (
      member.role === 'OWNER' &&
      member.status === 'ACTIVE' &&
      activeOwners <= 1
    );
  }

  function canEditMember(member: MembershipListItem): boolean {
    if (!canUpdate || !session) return false;
    if (member.user.id === session.user.id) return false;
    if (!isOwner && member.role === 'OWNER') return false;
    if (isLastActiveOwner(member)) return false;
    return true;
  }

  function openEditor(member: MembershipListItem): void {
    setEditing(member);
    setDraftRole(member.role);
    setDraftStatus(member.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE');
    setActionError(null);
  }

  function closeEditor(): void {
    setEditing(null);
    setActionError(null);
  }

  async function saveMember(): Promise<void> {
    if (!editing) return;

    const body: UpdateMemberInput = {};
    if (draftRole !== editing.role) body.role = draftRole;
    if (editing.status !== 'INVITED' && draftStatus !== editing.status) {
      body.status = draftStatus;
    }

    if (Object.keys(body).length === 0) {
      closeEditor();
      return;
    }

    setSaving(true);
    setActionError(null);
    try {
      await apiFetch(`/organizations/current/members/${editing.id}`, {
        method: 'PATCH',
        body,
      });
      closeEditor();
      await load(page);
    } catch (cause) {
      setActionError(errorMessage(cause, 'No se pudo actualizar al miembro.'));
    } finally {
      setSaving(false);
    }
  }

  const load = useCallback(
    async (targetPage: number) => {
      if (!canRead) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<PaginatedResponse<MembershipListItem>>(
          `/organizations/current/members?page=${targetPage}&pageSize=${PAGE_SIZE}`,
        );
        setMembers(data);
      } catch (cause) {
        setError(
          cause instanceof ApiError ? cause.message : 'No se pudo cargar el equipo.',
        );
      } finally {
        setLoading(false);
      }
    },
    [canRead],
  );

  useEffect(() => {
    // Carga de datos remotos al montar o cambiar de página.
    void load(page);
  }, [load, page]);

  if (!session) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Equipo</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Miembros de {session.organization.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Solo se listan membresías de esta organización. El aislamiento se aplica en la
            consulta, no en la interfaz.
          </p>
        </div>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Volver al panel
        </Link>
      </header>

      {!canRead ? (
        <Alert variant="warning">
          <AlertTitle>Sin acceso al equipo</AlertTitle>
          <AlertDescription>
            Tu rol no incluye el permiso <code>members:read</code>. La API también rechazaría
            esta consulta con 403.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Directorio</CardTitle>
              <CardDescription>
                {members
                  ? `${members.total} ${members.total === 1 ? 'miembro' : 'miembros'} en total`
                  : 'Cargando membresías'}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={loading}
              onClick={() => void load(page)}
            >
              Actualizar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Error al cargar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : loading && !members ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : members && members.items.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Alta</TableHead>
                      {canUpdate ? (
                        <TableHead className="text-right">Acciones</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.items.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.user.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.user.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              member.role === 'OWNER'
                                ? 'default'
                                : member.role === 'ADMIN'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              member.status === 'ACTIVE'
                                ? 'success'
                                : member.status === 'INVITED'
                                  ? 'warning'
                                  : 'destructive'
                            }
                          >
                            {member.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Intl.DateTimeFormat('es-MX', {
                            dateStyle: 'medium',
                            timeZone: session.organization.timezone,
                          }).format(new Date(member.createdAt))}
                        </TableCell>
                        {canUpdate ? (
                          <TableCell className="text-right">
                            {canEditMember(member) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditor(member)}
                              >
                                Editar
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {member.user.id === session.user.id
                                  ? 'Tu cuenta'
                                  : isLastActiveOwner(member)
                                    ? 'Último OWNER'
                                    : 'Sin permiso'}
                              </span>
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground">
                    Página {members.page} de {Math.max(members.totalPages, 1)}
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
                      disabled={page >= members.totalPages || loading}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay membresías registradas.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Modelo de roles</CardTitle>
          <CardDescription>
            Los permisos se asignan por rol y se resuelven en el servidor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {ROLE_ORDER.map((role) => (
              <li key={role} className="flex items-center gap-3">
                <Badge variant={role === 'OWNER' ? 'default' : 'secondary'}>
                  {ROLE_LABELS[role]}
                </Badge>
                <span>{permissionSummary(role)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            La invitación de nuevos miembros sigue pendiente de la Fase 3, cuando exista
            un proveedor de correo verificado. El cambio de rol y la suspensión ya se
            aplican contra la API y quedan auditados.
          </p>
        </CardContent>
      </Card>

      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-editor-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              closeEditor();
            }
          }}
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle id="member-editor-title">Editar miembro</CardTitle>
              <CardDescription>
                {editing.user.name} · {editing.user.email}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {actionError ? (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo actualizar</AlertTitle>
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="member-role">Rol</Label>
                <Select
                  id="member-role"
                  value={draftRole}
                  onChange={(event) => setDraftRole(event.target.value as Role)}
                >
                  {ROLES.filter((role) => isOwner || role !== 'OWNER').map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role] ?? role}
                    </option>
                  ))}
                </Select>
                {!isOwner ? (
                  <p className="text-xs text-muted-foreground">
                    Solo un propietario puede asignar el rol Propietario.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-status">Estado</Label>
                <Select
                  id="member-status"
                  value={draftStatus}
                  disabled={editing.status === 'INVITED'}
                  onChange={(event) =>
                    setDraftStatus(event.target.value as 'ACTIVE' | 'SUSPENDED')
                  }
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="SUSPENDED">Suspendido</option>
                </Select>
                {editing.status === 'INVITED' ? (
                  <p className="text-xs text-muted-foreground">
                    La membresía está invitada; el estado se habilita cuando acepte.
                  </p>
                ) : draftStatus === 'SUSPENDED' ? (
                  <p className="text-xs text-muted-foreground">
                    Al suspenderlo, su sesión se invalida en la siguiente petición.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button loading={saving} onClick={() => void saveMember()}>
                  Guardar cambios
                </Button>
                <Button variant="ghost" disabled={saving} onClick={closeEditor}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function permissionSummary(role: string): string {
  switch (role) {
    case 'OWNER':
      return 'Acceso total, incluida facturación y auditoría.';
    case 'ADMIN':
      return 'Operación y administración del equipo, sin facturación.';
    case 'MANAGER':
      return 'Servicios, empleados, clientes y agenda.';
    case 'STAFF':
      return 'Consulta operativa y gestión de citas.';
    default:
      return '';
  }
}
