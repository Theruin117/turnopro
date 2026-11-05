# API REST

- **Prefijo:** `/api/v1`
- **Base local:** `http://localhost:3001/api/v1`
- **OpenAPI/Swagger:** `http://localhost:3001/docs`
- **Formato:** JSON UTF-8
- **Autenticación:** `Authorization: Bearer <accessToken>`
- **Refresh:** cookie `httpOnly` `turnopro_refresh` (no se manipula desde JavaScript)

## 1. Autenticación

### Flujo

1. `POST /auth/register` o `POST /auth/login` devuelven un access token y establecen la cookie de refresh.
2. El cliente envía el access token en cada petición protegida.
3. Cuando el access token expira, `POST /auth/refresh` rota la cookie y devuelve uno nuevo.
4. `POST /auth/logout` revoca la familia y borra la cookie.

El access token dura 15 minutos por defecto. El refresh dura 30 días y se rota en cada uso.

`POST /auth/refresh` y `POST /auth/logout` exigen la cabecera `Origin` con un valor permitido (`WEB_ORIGIN`). Es una defensa CSRF; un cliente que no sea navegador debe enviarla explícitamente.

### `POST /auth/register`

Crea organización + usuario `OWNER` + membresía activa en una transacción.

```json
{
  "organizationName": "Estudio Aurora",
  "organizationSlug": "estudio-aurora",
  "name": "Ana Torres",
  "email": "ana@example.com",
  "password": "una-clave-segura-2026"
}
```

`201 Created`:

```json
{
  "accessToken": "eyJ...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "name": "Ana Torres",
    "email": "ana@example.com",
    "createdAt": "2026-11-04T18:00:00.000Z"
  },
  "organization": {
    "id": "uuid",
    "name": "Estudio Aurora",
    "slug": "estudio-aurora",
    "timezone": "America/Mexico_City",
    "currency": "MXN",
    "status": "ACTIVE",
    "createdAt": "2026-11-04T18:00:00.000Z"
  },
  "membership": {
    "id": "uuid",
    "role": "OWNER",
    "permissions": ["organization:read", "..."]
  }
}
```

Errores: `409 EMAIL_TAKEN`, `409 SLUG_TAKEN`, `400 VALIDATION_ERROR`.

### `POST /auth/login`

```json
{
  "email": "ana@example.com",
  "password": "una-clave-segura-2026",
  "organizationSlug": "estudio-aurora"
}
```

`200 OK` con el mismo cuerpo que el registro.

Si el usuario tiene varias organizaciones activas y omite `organizationSlug`, responde:

```json
{
  "error": {
    "code": "ORGANIZATION_REQUIRED",
    "message": "Selecciona una organización para continuar",
    "details": {
      "organizations": [
        { "slug": "estudio-aurora", "name": "Estudio Aurora" },
        { "slug": "sucursal-centro", "name": "Sucursal Centro" }
      ]
    },
    "timestamp": "2026-11-04T18:00:00.000Z",
    "requestId": "uuid"
  }
}
```

Errores: `401 INVALID_CREDENTIALS`, `403 MEMBERSHIP_INACTIVE`, `403 ORGANIZATION_INACTIVE`.

### `POST /auth/refresh`

Sin cuerpo. Requiere cookie y `Origin`.

- `200 OK`: nuevo `accessToken` y cookie rotada.
- `401 REFRESH_TOKEN_INVALID`: cookie ausente, expirada o revocada.
- `401 TOKEN_REUSED`: se detectó reutilización; toda la familia fue revocada.

### `POST /auth/logout`

Sin cuerpo. Requiere cookie y `Origin`. `204 No Content`. Siempre limpia la cookie.

### `GET /auth/me`

Requiere access token. Devuelve el contexto actual sin el token:

```json
{
  "user": { "id": "uuid", "name": "Ana Torres", "email": "ana@example.com", "createdAt": "..." },
  "organization": { "id": "uuid", "name": "Estudio Aurora", "slug": "estudio-aurora", "timezone": "...", "currency": "MXN", "status": "ACTIVE", "createdAt": "..." },
  "membership": { "id": "uuid", "role": "OWNER", "permissions": ["..."] }
}
```

## 2. Organización

### `GET /organizations/current`

Permiso: `organization:read`. Devuelve la organización activa.

### `PATCH /organizations/current`

Permiso: `organization:update`. Campos opcionales, al menos uno:

```json
{
  "name": "Estudio Aurora Centro",
  "timezone": "America/Mexico_City",
  "currency": "MXN"
}
```

Valida zona horaria IANA y moneda ISO 4217 de tres letras. Registra auditoría.

### `GET /organizations/current/members`

Permiso: `members:read`. Paginado.

```json
{
  "items": [
    {
      "id": "uuid",
      "role": "OWNER",
      "status": "ACTIVE",
      "createdAt": "2026-11-04T18:00:00.000Z",
      "user": { "id": "uuid", "name": "Ana Torres", "email": "ana@example.com" }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "totalPages": 1
}
```

## 3. Turnos

Permisos: lectura `appointments:read`; creación/cancelación `appointments:write`.

### `GET /appointments`

Parámetros de consulta:

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `page` | entero ≥ 1 | Página, por defecto 1 |
| `pageSize` | entero 1–100 | Tamaño, por defecto 20 |
| `from` | ISO 8601 | Inicio mínimo (`startAt >= from`) |
| `to` | ISO 8601 | Fin máximo (`startAt < to`) |
| `status` | enum | `PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW` |
| `employeeId` | UUID | Filtra por empleado del tenant |

Devuelve un `PaginatedResponse<Appointment>` ordenado por `startAt` ascendente.

### `GET /appointments/:id`

Devuelve el turno si pertenece a la organización activa. Si no existe o es de otro tenant: `404 NOT_FOUND`.

### `POST /appointments`

Cabecera opcional recomendada:

```
Idempotency-Key: 3f8c1b2a-reserva-001
```

Cuerpo:

```json
{
  "clientId": "uuid",
  "employeeId": "uuid",
  "serviceId": "uuid",
  "startAt": "2026-11-10T16:00:00.000Z",
  "notes": "Primera visita"
}
```

Reglas:

- `startAt` debe ser futuro y con zona horaria.
- Cliente, empleado y servicio deben pertenecer al tenant y estar activos.
- El empleado debe ofrecer el servicio.
- No debe haber `time_off` ni otro turno no cancelado que se solape con el rango bloqueado.
- El rango bloqueado incluye los buffers del servicio.

Respuestas:

- `201 Created`: turno creado, o replay del turno existente si la clave ya se usó con los mismos datos.
- `400 VALIDATION_ERROR`: datos inválidos o empleado sin el servicio.
- `404 NOT_FOUND`: cliente/empleado/servicio inexistente en el tenant.
- `409 BOOKING_SLOT_UNAVAILABLE`: solapamiento, `time_off` o carrera perdida.
- `409 IDEMPOTENCY_CONFLICT`: misma clave con datos distintos.

Respuesta:

```json
{
  "id": "uuid",
  "startAt": "2026-11-10T16:00:00.000Z",
  "endAt": "2026-11-10T16:30:00.000Z",
  "blockedFromAt": "2026-11-10T15:55:00.000Z",
  "blockedUntilAt": "2026-11-10T16:35:00.000Z",
  "status": "PENDING",
  "notes": "Primera visita",
  "idempotencyKey": "3f8c1b2a-reserva-001",
  "cancelledAt": null,
  "cancellationReason": null,
  "createdAt": "2026-11-04T18:05:00.000Z",
  "client": { "id": "uuid", "name": "Cliente Demo" },
  "employee": { "id": "uuid", "name": "Ana López (demo)" },
  "service": { "id": "uuid", "name": "Consulta general", "durationMinutes": 30, "priceCents": 50000 }
}
```

La respuesta **no** expone `organizationId`. El cliente ya conoce su tenant por la sesión.

#### Idempotencia en detalle

- La clave se acepta por cabecera `Idempotency-Key` o por el campo `idempotencyKey` del cuerpo.
- Formato: 1–128 caracteres `[A-Za-z0-9._:-]`.
- El alcance es por organización.
- Reintentar con la misma clave y el mismo payload devuelve `201` con el mismo `id`.
- Reintentar con la misma clave y otro payload devuelve `409`.
- Sin clave, cada petición crea un turno nuevo (sujeto a solapamiento).

### `PATCH /appointments/:id/cancel`

Cuerpo opcional:

```json
{ "reason": "El cliente no puede asistir" }
```

- `200 OK`: turno `CANCELLED`, con `cancelledAt` y `cancellationReason`.
- Cancelar un turno ya cancelado devuelve el mismo recurso.
- `409 CONFLICT` si el turno está `COMPLETED`.
- `404 NOT_FOUND` si no pertenece al tenant.

La cancelación libera el slot para futuras reservas.

### `PATCH /appointments/:id/status`

Cuerpo:

```json
{ "status": "CONFIRMED", "reason": "opcional, solo al cancelar" }
```

Estados destino admitidos: `CONFIRMED`, `COMPLETED`, `NO_SHOW` y `CANCELLED`.

Transiciones válidas:

| Desde | Hacia |
| --- | --- |
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `COMPLETED`, `NO_SHOW`, `CANCELLED` |
| `COMPLETED`, `CANCELLED`, `NO_SHOW` | ninguna (terminales) |

Reglas:

- `COMPLETED` y `NO_SHOW` solo se permiten cuando el turno ya comenzó.
- `CANCELLED` reutiliza el flujo de cancelación (motivo y `cancelledAt`).
- Repetir el estado actual devuelve `200` sin cambios.
- `409 CONFLICT` ante una transición inválida o un turno futuro.
- `404 NOT_FOUND` si el turno no pertenece al tenant.

Cada cambio queda registrado como `appointment.status_changed` en auditoría.

### `PATCH /appointments/:id/schedule`

Reprograma un turno existente. Cuerpo:

```json
{
  "startAt": "2026-11-12T17:00:00.000Z",
  "employeeId": "uuid opcional",
  "serviceId": "uuid opcional",
  "notes": "opcional"
}
```

- `startAt` es obligatorio y debe estar en el futuro.
- Si se omite `employeeId` o `serviceId` se conserva el valor actual.
- Replica los invariantes de creación: empleado y servicio activos de la
  organización, vínculo empleado-servicio, `time_off` y solapamiento con buffers.
  El propio turno se excluye de la comprobación de solapamiento.
- `200 OK` con el turno actualizado. La reprogramación no cambia el estado.
- `409 CONFLICT` si el turno está `COMPLETED`, `CANCELLED` o `NO_SHOW`, o si el
  horario deja de estar disponible (código `BOOKING_SLOT_UNAVAILABLE`).
- `404 NOT_FOUND` si el turno, empleado o servicio no pertenecen al tenant.
- `400 VALIDATION_ERROR` si el empleado no ofrece el servicio.

Se audita como `appointment.rescheduled`, incluyendo el horario, empleado y
servicio anteriores. Las reprogramaciones concurrentes al mismo slot se
resuelven con la transacción `SERIALIZABLE` y la restricción de exclusión: solo
una gana y la otra recibe `409`.

## 4. Catálogo

Permisos: `services:read/write`, `employees:read/write`, `clients:read/write`. Cada recurso se busca siempre por `organizationId`; un identificador de otra organización responde `404 NOT_FOUND`.

### Servicios

| Método | Ruta | Permiso | Descripción |
| --- | --- | --- | --- |
| `GET` | `/services` | `services:read` | Lista paginada |
| `GET` | `/services/:id` | `services:read` | Detalle |
| `POST` | `/services` | `services:write` | Crear |
| `PATCH` | `/services/:id` | `services:write` | Actualizar |
| `DELETE` | `/services/:id` | `services:write` | Archivar (`ARCHIVED`) |

`GET /services` acepta `page`, `pageSize`, `status` (`ACTIVE`, `ARCHIVED`) y `search` por nombre.

Cuerpo de creación:

```json
{
  "name": "Consulta general",
  "description": "Consulta de 30 minutos",
  "durationMinutes": 30,
  "bufferBeforeMinutes": 5,
  "bufferAfterMinutes": 5,
  "priceCents": 45000
}
```

- El nombre es único por organización sin distinguir mayúsculas (`409 CONFLICT` si se repite).
- Los buffers extienden el rango bloqueado del turno, no la duración mostrada al cliente.
- `DELETE` es idempotente y sólo cambia el estado; conserva el historial de turnos.

### Empleados

| Método | Ruta | Permiso | Descripción |
| --- | --- | --- | --- |
| `GET` | `/employees` | `employees:read` | Lista paginada con servicios |
| `GET` | `/employees/:id` | `employees:read` | Detalle |
| `POST` | `/employees` | `employees:write` | Crear y asignar servicios |
| `PATCH` | `/employees/:id` | `employees:write` | Actualizar |
| `DELETE` | `/employees/:id` | `employees:write` | Marcar `INACTIVE` |

`GET /employees` acepta `page`, `pageSize`, `status` (`ACTIVE`, `INACTIVE`) y `search` por nombre o correo.

```json
{
  "name": "Ana López",
  "email": "ana@estudio.local",
  "phone": "+5215555550100",
  "color": "#2563EB",
  "serviceIds": ["uuid-servicio"]
}
```

- `serviceIds` reemplaza por completo la oferta del empleado en cada `PATCH`.
- Sólo se aceptan servicios de la misma organización; de lo contrario `400 VALIDATION_ERROR`.
- Un empleado inactivo no aparece en el cálculo de slots.

### Clientes

| Método | Ruta | Permiso | Descripción |
| --- | --- | --- | --- |
| `GET` | `/clients` | `clients:read` | Lista paginada |
| `GET` | `/clients/:id` | `clients:read` | Detalle |
| `POST` | `/clients` | `clients:write` | Crear |
| `PATCH` | `/clients/:id` | `clients:write` | Actualizar |
| `DELETE` | `/clients/:id` | `clients:write` | Archivar (`ARCHIVED`) |

`GET /clients` acepta `page`, `pageSize`, `status` (`ACTIVE`, `ARCHIVED`) y `search` por nombre, correo o teléfono. Archivar conserva el historial de turnos y evita nuevas reservas con ese cliente.

## 5. Disponibilidad

### `GET /availability/slots`

Permiso: `appointments:read`.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `employeeId` | UUID | Sí | Empleado activo del tenant |
| `serviceId` | UUID | Sí | Servicio activo ofrecido por el empleado |
| `date` | `YYYY-MM-DD` | Sí | Fecha local en la zona de la organización |

Calcula los inicios posibles en pasos de 15 minutos dentro del horario semanal, restando turnos no cancelados, `time_off`, buffers y horas ya pasadas. No reserva nada.

```json
{
  "date": "2026-11-10",
  "timezone": "America/Mexico_City",
  "employeeId": "uuid",
  "serviceId": "uuid",
  "durationMinutes": 30,
  "slots": [
    { "startAt": "2026-11-10T16:00:00.000Z", "endAt": "2026-11-10T16:30:00.000Z" }
  ]
}
```

Si el empleado no ofrece el servicio: `400 VALIDATION_ERROR`. Si empleado o servicio no pertenecen al tenant o están inactivos: `404 NOT_FOUND`.

### `GET /availability/employees/:employeeId/rules`

Permiso: `employees:read`. Devuelve el horario semanal ordenado por día y minuto:

```json
[
  {
    "id": "uuid",
    "employeeId": "uuid",
    "weekday": 1,
    "startMinute": 540,
    "endMinute": 1080,
    "createdAt": "2026-11-04T18:00:00.000Z",
    "updatedAt": "2026-11-04T18:00:00.000Z"
  }
]
```

`weekday` usa `0 = domingo … 6 = sábado`. Los minutos se cuentan desde medianoche local (540 = 09:00). `endMinute` puede ser 1440.

### `PUT /availability/employees/:employeeId/rules`

Permiso: `employees:write`. Reemplaza el horario completo dentro de una transacción:

```json
{
  "rules": [
    { "weekday": 1, "startMinute": 540, "endMinute": 780 },
    { "weekday": 1, "startMinute": 900, "endMinute": 1080 }
  ]
}
```

- Cada intervalo debe terminar después de empezar.
- Dos intervalos del mismo día no pueden solaparse (`400 VALIDATION_ERROR`).
- Enviar `rules: []` deja al empleado sin atención semanal.
- La operación registra auditoría `availability.rules_replaced`.

### `GET /availability/employees/:employeeId/time-off`

Permiso: `employees:read`. Acepta `from` y `to` ISO 8601 opcionales para filtrar por intersección. Devuelve los bloqueos ordenados por inicio.

### `POST /availability/employees/:employeeId/time-off`

Permiso: `employees:write`.

```json
{
  "startsAt": "2026-11-15T15:00:00.000Z",
  "endsAt": "2026-11-15T18:00:00.000Z",
  "reason": "Capacitación"
}
```

El fin debe ser posterior al inicio. El bloqueo impide slots y reservas que se solapen con el rango, incluidos los buffers.

### `DELETE /availability/time-off/:id`

Permiso: `employees:write`. Elimina un bloqueo de la organización activa. Responde `204 No Content`; si no pertenece al tenant, `404 NOT_FOUND`.

## 6. Salud

### `GET /health/live`

`200 OK`:

```json
{
  "status": "ok",
  "service": "turnopro-api",
  "version": "0.1.0",
  "timestamp": "2026-11-04T18:00:00.000Z",
  "uptimeSeconds": 120,
  "checks": {}
}
```

### `GET /health/ready`

Comprueba PostgreSQL y Redis (y estado del proceso). `200` si todo está arriba; `503` con `status: "degraded"` si falta una dependencia.

El worker expone las mismas rutas en `http://localhost:3002/health/live` y `/health/ready`, con checks de base de datos, Redis y worker.

## 7. Formato de errores

Todos los errores comparten la misma envoltura:

```json
{
  "error": {
    "code": "BOOKING_SLOT_UNAVAILABLE",
    "message": "El horario seleccionado ya no está disponible",
    "details": null,
    "requestId": "uuid",
    "timestamp": "2026-11-04T18:00:00.000Z",
    "path": "/api/v1/appointments"
  }
}
```

Códigos disponibles:

| Código | HTTP típico |
| --- | --- |
| `VALIDATION_ERROR` | 400 |
| `UNAUTHORIZED` | 401 |
| `INVALID_CREDENTIALS` | 401 |
| `REFRESH_TOKEN_INVALID` | 401 |
| `TOKEN_REUSED` | 401 |
| `FORBIDDEN` | 403 |
| `MEMBERSHIP_INACTIVE` | 403 |
| `ORGANIZATION_INACTIVE` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `EMAIL_TAKEN` | 409 |
| `SLUG_TAKEN` | 409 |
| `ORGANIZATION_REQUIRED` | 409 |
| `IDEMPOTENCY_CONFLICT` | 409 |
| `BOOKING_SLOT_UNAVAILABLE` | 409 |
| `RATE_LIMITED` | 429 |
| `SERVICE_UNAVAILABLE` | 503 |
| `INTERNAL_ERROR` | 500 |

Nunca se devuelven stack traces, SQL ni detalles internos.

## 8. Paginación

Todas las listas paginadas usan:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0,
  "totalPages": 0
}
```

`pageSize` máximo: 100.

## 9. Rate limiting

Límites por IP (ventana deslizante en memoria):

| Ruta | Límite |
| --- | --- |
| `POST /auth/register` | 5 / minuto |
| `POST /auth/login` | 10 / minuto |
| `POST /auth/refresh` | 60 / minuto |
| `POST /auth/logout` | 30 / minuto |
| Resto | 100 / minuto (configurable) |

Al exceder: `429 RATE_LIMITED`.

## 10. Ejemplos con cURL

```bash
# Registro
curl -i -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"organizationName":"Estudio Aurora","organizationSlug":"estudio-aurora","name":"Ana Torres","email":"ana@example.com","password":"una-clave-segura-2026"}'

# Login (guarda cookies)
curl -i -c cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@demo.turnopro.local","password":"TurnoProDemo123!","organizationSlug":"demo"}'

# Sesión actual
curl http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Crear turno idempotente
curl -i -X POST http://localhost:3001/api/v1/appointments \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: reserva-001' \
  -d '{"clientId":"'$CLIENT_ID'","employeeId":"'$EMPLOYEE_ID'","serviceId":"'$SERVICE_ID'","startAt":"2026-11-10T16:00:00.000Z"}'

# Consultar slots disponibles
curl "http://localhost:3001/api/v1/availability/slots?employeeId=$EMPLOYEE_ID&serviceId=$SERVICE_ID&date=2026-11-10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Reemplazar horario semanal (lunes 09:00–13:00 y 15:00–18:00)
curl -X PUT "http://localhost:3001/api/v1/availability/employees/$EMPLOYEE_ID/rules" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"rules":[{"weekday":1,"startMinute":540,"endMinute":780},{"weekday":1,"startMinute":900,"endMinute":1080}]}'

# Refrescar (requiere Origin)
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3001/api/v1/auth/refresh \
  -H 'Origin: http://localhost:3000'
```

## 11. Contratos y versionado

Los tipos públicos viven en `packages/contracts` y los esquemas Zod en el mismo paquete. La versión actual es `v1` en la ruta.

Cambios incompatibles deben introducir una nueva versión (`/api/v2`) o un periodo de convivencia. Los cambios aditivos (nuevos campos opcionales) no rompen el contrato.
