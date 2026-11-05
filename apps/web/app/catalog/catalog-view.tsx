'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type {
  Client,
  Employee,
  PaginatedResponse,
  Service,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  cn,
} from '@turnopro/ui';

import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch, ApiError } from '@/lib/api';

type Tab = 'services' | 'employees' | 'clients';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'services', label: 'Servicios' },
  { id: 'employees', label: 'Empleados' },
  { id: 'clients', label: 'Clientes' },
];

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function CatalogView() {
  const [tab, setTab] = useState<Tab>('services');
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [servicesPage, employeesPage, clientsPage] = await Promise.all([
        apiFetch<PaginatedResponse<Service>>('/services?pageSize=100'),
        apiFetch<PaginatedResponse<Employee>>('/employees?pageSize=100'),
        apiFetch<PaginatedResponse<Client>>('/clients?pageSize=100'),
      ]);
      setServices(servicesPage.items);
      setEmployees(employeesPage.items);
      setClients(clientsPage.items);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo cargar el catálogo'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial del catálogo remoto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, [loadAll]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Catálogo
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Servicios, empleados y clientes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estos datos alimentan la agenda y el motor de reservas de la organización activa.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadAll()} loading={loading}>
          Actualizar
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Button
            key={item.id}
            variant={tab === item.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>No se pudo completar la operación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : tab === 'services' ? (
          <ServicesSection
            services={services}
            onChanged={loadAll}
            onError={setError}
          />
        ) : tab === 'employees' ? (
          <EmployeesSection
            employees={employees}
            services={services}
            onChanged={loadAll}
            onError={setError}
          />
        ) : (
          <ClientsSection clients={clients} onChanged={loadAll} onError={setError} />
        )}
      </div>
    </div>
  );
}

interface SectionProps {
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}

function ServicesSection({
  services,
  onChanged,
  onError,
}: SectionProps & { services: Service[] }) {
  const { session, hasPermission } = useAuth();
  const canWrite = hasPermission('services:write');
  const [editing, setEditing] = useState<Service | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    durationMinutes: '30',
    bufferBeforeMinutes: '0',
    bufferAfterMinutes: '0',
    price: '0',
  });

  const reset = () => {
    setEditing(null);
    setForm({
      name: '',
      description: '',
      durationMinutes: '30',
      bufferBeforeMinutes: '0',
      bufferAfterMinutes: '0',
      price: '0',
    });
  };

  const startCreate = () => {
    reset();
    setOpen(true);
  };

  const startEdit = (service: Service) => {
    setEditing(service);
    setForm({
      name: service.name,
      description: service.description ?? '',
      durationMinutes: String(service.durationMinutes),
      bufferBeforeMinutes: String(service.bufferBeforeMinutes),
      bufferAfterMinutes: String(service.bufferAfterMinutes),
      price: (service.priceCents / 100).toFixed(2),
    });
    setOpen(true);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    onError(null);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        durationMinutes: Number(form.durationMinutes),
        bufferBeforeMinutes: Number(form.bufferBeforeMinutes),
        bufferAfterMinutes: Number(form.bufferAfterMinutes),
        priceCents: Math.round(Number(form.price) * 100),
      };
      if (editing) {
        await apiFetch(`/services/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/services', { method: 'POST', body });
      }
      setOpen(false);
      reset();
      await onChanged();
    } catch (cause) {
      onError(errorMessage(cause, 'No se pudo guardar el servicio'));
    } finally {
      setSaving(false);
    }
  }

  async function archive(service: Service): Promise<void> {
    if (!window.confirm(`¿Archivar el servicio "${service.name}"?`)) {
      return;
    }
    onError(null);
    try {
      await apiFetch(`/services/${service.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (cause) {
      onError(errorMessage(cause, 'No se pudo archivar el servicio'));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Servicios</CardTitle>
          <CardDescription>
            Duración, buffers y precio que el motor usa para bloquear la agenda.
          </CardDescription>
        </div>
        {canWrite ? <Button onClick={startCreate}>Nuevo servicio</Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {open && canWrite ? (
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-2"
          >
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="service-name">Nombre</Label>
              <Input
                id="service-name"
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="service-description">Descripción</Label>
              <Textarea
                id="service-description"
                maxLength={2000}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-duration">Duración (min)</Label>
              <Input
                id="service-duration"
                type="number"
                min={1}
                max={1440}
                required
                value={form.durationMinutes}
                onChange={(event) =>
                  setForm({ ...form, durationMinutes: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-price">Precio</Label>
              <Input
                id="service-price"
                type="number"
                min={0}
                step="0.01"
                required
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-buffer-before">Buffer antes (min)</Label>
              <Input
                id="service-buffer-before"
                type="number"
                min={0}
                max={240}
                value={form.bufferBeforeMinutes}
                onChange={(event) =>
                  setForm({ ...form, bufferBeforeMinutes: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-buffer-after">Buffer después (min)</Label>
              <Input
                id="service-buffer-after"
                type="number"
                min={0}
                max={240}
                value={form.bufferAfterMinutes}
                onChange={(event) =>
                  setForm({ ...form, bufferAfterMinutes: event.target.value })
                }
              />
            </div>
            <div className="flex items-end gap-2 md:col-span-2">
              <Button type="submit" loading={saving}>
                {editing ? 'Guardar cambios' : 'Crear servicio'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Servicio</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Buffers</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              {canWrite ? <TableHead className="text-right">Acciones</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 6 : 5} className="text-muted-foreground">
                  Todavía no hay servicios. Crea el primero para poder reservar.
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell>
                    <p className="font-medium">{service.name}</p>
                    {service.description ? (
                      <p className="max-w-72 truncate text-xs text-muted-foreground">
                        {service.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>{service.durationMinutes} min</TableCell>
                  <TableCell className="text-muted-foreground">
                    {service.bufferBeforeMinutes} / {service.bufferAfterMinutes} min
                  </TableCell>
                  <TableCell>
                    {formatMoney(service.priceCents, session?.organization.currency ?? 'MXN')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={service.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {service.status === 'ACTIVE' ? 'Activo' : 'Archivado'}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(service)}>
                          Editar
                        </Button>
                        {service.status === 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => void archive(service)}
                          >
                            Archivar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EmployeesSection({
  employees,
  services,
  onChanged,
  onError,
}: SectionProps & { employees: Employee[]; services: Service[] }) {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('employees:write');
  const activeServices = useMemo(
    () => services.filter((service) => service.status === 'ACTIVE'),
    [services],
  );
  const [editing, setEditing] = useState<Employee | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    color: '#0F766E',
    serviceIds: [] as string[],
  });

  const reset = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', color: '#0F766E', serviceIds: [] });
  };

  const startCreate = () => {
    reset();
    setOpen(true);
  };

  const startEdit = (employee: Employee) => {
    setEditing(employee);
    setForm({
      name: employee.name,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      color: employee.color ?? '#0F766E',
      serviceIds: employee.services.map((service) => service.id),
    });
    setOpen(true);
  };

  function toggleService(serviceId: string): void {
    setForm((current) => ({
      ...current,
      serviceIds: current.serviceIds.includes(serviceId)
        ? current.serviceIds.filter((id) => id !== serviceId)
        : [...current.serviceIds, serviceId],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    onError(null);
    try {
      const body = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        color: form.color || undefined,
        serviceIds: form.serviceIds,
      };
      if (editing) {
        await apiFetch(`/employees/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/employees', { method: 'POST', body });
      }
      setOpen(false);
      reset();
      await onChanged();
    } catch (cause) {
      onError(errorMessage(cause, 'No se pudo guardar el empleado'));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(employee: Employee): Promise<void> {
    if (!window.confirm(`¿Marcar a "${employee.name}" como inactivo?`)) {
      return;
    }
    onError(null);
    try {
      await apiFetch(`/employees/${employee.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (cause) {
      onError(errorMessage(cause, 'No se pudo desactivar el empleado'));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Empleados</CardTitle>
          <CardDescription>
            Cada empleado ofrece uno o más servicios y puede tener horario propio.
          </CardDescription>
        </div>
        {canWrite ? <Button onClick={startCreate}>Nuevo empleado</Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {open && canWrite ? (
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="employee-name">Nombre</Label>
              <Input
                id="employee-name"
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-email">Correo</Label>
              <Input
                id="employee-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-phone">Teléfono</Label>
              <Input
                id="employee-phone"
                maxLength={32}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-color">Color en la agenda</Label>
              <Input
                id="employee-color"
                type="color"
                value={form.color}
                onChange={(event) => setForm({ ...form, color: event.target.value })}
              />
            </div>
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-sm font-medium">Servicios que ofrece</legend>
              {activeServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay servicios activos. Crea uno en la pestaña Servicios.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeServices.map((service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-teal-700"
                        checked={form.serviceIds.includes(service.id)}
                        onChange={() => toggleService(service.id)}
                      />
                      <span className="truncate">{service.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="flex items-end gap-2 md:col-span-2">
              <Button type="submit" loading={saving}>
                {editing ? 'Guardar cambios' : 'Crear empleado'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Servicios</TableHead>
              <TableHead>Estado</TableHead>
              {canWrite ? <TableHead className="text-right">Acciones</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 5 : 4} className="text-muted-foreground">
                  Sin empleados registrados.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: employee.color ?? '#0F766E' }}
                      />
                      <span className="font-medium">{employee.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <p>{employee.email ?? '—'}</p>
                    <p className="text-xs">{employee.phone ?? ''}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {employee.services.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Sin servicios</span>
                      ) : (
                        employee.services.map((service) => (
                          <Badge key={service.id} variant="secondary">
                            {service.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {employee.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(employee)}>
                          Editar
                        </Button>
                        {employee.status === 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => void deactivate(employee)}
                          >
                            Desactivar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ClientsSection({
  clients,
  onChanged,
  onError,
}: SectionProps & { clients: Client[] }) {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('clients:write');
  const [editing, setEditing] = useState<Client | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });

  const reset = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', notes: '' });
  };

  const startCreate = () => {
    reset();
    setOpen(true);
  };

  const startEdit = (client: Client) => {
    setEditing(client);
    setForm({
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      notes: client.notes ?? '',
    });
    setOpen(true);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    onError(null);
    try {
      const body = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        notes: form.notes || undefined,
      };
      if (editing) {
        await apiFetch(`/clients/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiFetch('/clients', { method: 'POST', body });
      }
      setOpen(false);
      reset();
      await onChanged();
    } catch (cause) {
      onError(errorMessage(cause, 'No se pudo guardar el cliente'));
    } finally {
      setSaving(false);
    }
  }

  async function archive(client: Client): Promise<void> {
    if (!window.confirm(`¿Archivar al cliente "${client.name}"?`)) {
      return;
    }
    onError(null);
    try {
      await apiFetch(`/clients/${client.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (cause) {
      onError(errorMessage(cause, 'No se pudo archivar el cliente'));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Clientes</CardTitle>
          <CardDescription>
            Datos de contacto que se asocian a los turnos. El archivo conserva el historial.
          </CardDescription>
        </div>
        {canWrite ? <Button onClick={startCreate}>Nuevo cliente</Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {open && canWrite ? (
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-lg border bg-muted/30 p-4 md:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="client-name">Nombre</Label>
              <Input
                id="client-name"
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Correo</Label>
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Teléfono</Label>
              <Input
                id="client-phone"
                maxLength={32}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="client-notes">Notas</Label>
              <Textarea
                id="client-notes"
                maxLength={2000}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
            <div className="flex items-end gap-2 md:col-span-2">
              <Button type="submit" loading={saving}>
                {editing ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Estado</TableHead>
              {canWrite ? <TableHead className="text-right">Acciones</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 5 : 4} className="text-muted-foreground">
                  Sin clientes registrados.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <p>{client.email ?? '—'}</p>
                    <p className="text-xs">{client.phone ?? ''}</p>
                  </TableCell>
                  <TableCell className="max-w-72 truncate text-muted-foreground">
                    {client.notes ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={client.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {client.status === 'ACTIVE' ? 'Activo' : 'Archivado'}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(client)}>
                          Editar
                        </Button>
                        {client.status === 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn('text-destructive')}
                            onClick={() => void archive(client)}
                          >
                            Archivar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
