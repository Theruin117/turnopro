# Roadmap

## Estado actual

La fundación y el primer módulo de negocio están entregados y verificados:

- monorrepositorio pnpm + Turborepo;
- web Next.js con registro, login, panel, ajustes, equipo, agenda, catálogo,
  disponibilidad, reportes, auditoría y ficha de cliente;
- API NestJS con OpenAPI;
- PostgreSQL + Prisma con migración inicial y seed;
- multi-tenancy y RBAC;
- motor de reservas idempotente y resistente a concurrencia;
- CRUD de servicios, empleados y clientes con archivado/desactivación;
- horario semanal por empleado, bloqueos puntuales y cálculo de slots;
- estados operativos y reprogramación de turnos;
- reportes de ocupación e ingresos, auditoría visible y gestión de miembros;
- worker BullMQ con limpieza programada y script de sandbox supervisado;
- CI en GitHub Actions con jobs de calidad y de integración/e2e;
- Dockerfile y Compose preparados;
- pruebas unitarias, de integración y e2e;
- documentación de arquitectura, base de datos, API, seguridad y operación.

## Módulo entregado: agenda y disponibilidad

Alcance implementado:

1. **CRUD de servicios** (`services:read/write`), con nombre único por organización, duración, buffers, precio y archivado.
2. **CRUD de empleados** (`employees:read/write`), con color, servicios ofrecidos y desactivación.
3. **CRUD de clientes** (`clients:read/write`), con archivado que conserva el historial.
4. **Reglas de disponibilidad** por empleado y día, reemplazadas atómicamente, con validación de solapamientos.
5. **Bloqueos puntuales** (`time_off`) con creación, listado filtrado por rango y eliminación.
6. **Slots disponibles** en `GET /availability/slots`, con pasos de 15 minutos, zona horaria de la organización, buffers, turnos y bloqueos.
7. **UI de agenda diaria** con selección de cliente/servicio/empleado, reserva idempotente y cancelación.
8. **UI de catálogo** por pestañas y **UI de disponibilidad** con editor semanal y bloqueos.

Criterios de aceptación cubiertos:

- `STAFF` puede ver agenda y crear/cancelar turnos; no edita catálogo.
- `MANAGER`/`ADMIN`/`OWNER` editan servicios, empleados, clientes, reglas y bloqueos.
- Los slots respetan buffers, `time_off` y turnos no cancelados.
- La reserva mantiene idempotencia y la restricción de exclusión ante carreras.
- La UI muestra fechas y horas en la zona de la organización.
- Las pruebas e2e cubren aislamiento entre dos organizaciones y validación de DTOs.

## Fase 2 entregada: operación del negocio

La agenda quedó convertida en operación diaria completa:

1. **Historial de clientes**: `GET /appointments?clientId=` con validación de pertenencia y
   ficha `/clients/[id]` con datos, notas e historial paginado.
2. **Reprogramación**: `PATCH /appointments/:id/schedule` revalida empleado-servicio,
   bloqueos, buffers y solapamientos dentro de una transacción `SERIALIZABLE`.
3. **Estados operativos**: `PATCH /appointments/:id/status` con transiciones declaradas en
   `APPOINTMENT_TRANSITIONS`; `COMPLETED` y `NO_SHOW` exigen que el turno haya comenzado.
4. **Reportes**: `GET /reports/summary` con totales, tasas, ingresos de turnos completados,
   ocupación por empleado y desglose diario en la zona horaria de la organización.
5. **Auditoría visible**: `GET /audit` paginado con filtros por entidad, acción y fechas, y
   pantalla `/audit` para roles con `audit:read`.
6. **Equipo**: `PATCH /organizations/current/members/:id` para rol y suspensión, con
   protección del último `OWNER` activo y de la edición propia.
7. **Panel**: métricas de los últimos 7 días, próximos turnos de hoy y salud de la plataforma.

Criterios cubiertos:

- Reprogramar no permite solapamientos ni deja el slot anterior bloqueado.
- Los reportes filtran por organización y rango (máximo 366 días).
- Un `STAFF` no accede a reportes ni auditoría (`403`).
- La navegación oculta las secciones sin permiso.
- Las pruebas e2e cubren aislamiento entre organizaciones y transiciones inválidas.

Pendiente de la fase: invitaciones por correo (requiere proveedor de email) y recordatorios
(outbox + worker + proveedor transaccional).

## Hardening entregado

- **CI**: `.github/workflows/ci.yml` con un job `quality` (lint, guard de tenant,
  tipos, build y pruebas unitarias) y un job `e2e` con PostgreSQL 16 y Redis 7
  efímeros (migración, seed, integración y e2e).
- **Aislamiento**: `pnpm check:tenant-scope` revisa las consultas Prisma de la
  API y falla si no filtran por organización; documentado en
  [`SECURITY.md`](SECURITY.md).
- **Copias de seguridad**: procedimiento de `pg_dump`/`pg_restore` y simulacro
  verificado con conteos e índices idénticos, en
  [`DEPLOYMENT.md`](DEPLOYMENT.md).
- **Worker**: script `scripts/worker-sandbox.mjs` con Redis local, reinicio con
  backoff, health checks y cierre ordenado. Sólo para demostración.
- **Observabilidad mínima**: logs JSON, `X-Request-Id`, health checks de API y
  worker, y decisión documentada sobre OpenTelemetry en
  [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Fase 2 — Operación del negocio

| Módulo | Alcance | Estado |
| --- | --- | --- |
| Historial de clientes | Turnos pasados, notas y búsqueda (CRUD ya entregado) | Entregado |
| Servicios y precios | Impuestos y listas de precios (catálogo base ya entregado) | Pendiente |
| Equipo e invitaciones | Invitar por correo, aceptar, suspender | Rol y suspensión entregados; invitación pendiente de email |
| Reportes | Ocupación, ingresos, cancelaciones | Entregado |
| Auditoría visible | Pantalla de actividad para `ADMIN`/`OWNER` | Entregado |

## Fase 3 — Comunicaciones

| Módulo | Alcance | Notas |
| --- | --- | --- |
| Email transaccional | Verificación, invitaciones, recordatorios | Usar outbox + worker |
| WhatsApp | Recordatorios y confirmaciones | Requiere adaptador y plantillas aprobadas |
| Notificaciones in-app | Centro de actividad | Consume outbox |

**Importante:** no se debe integrar WhatsApp ni OpenAI en la UI hasta que exista un adaptador real, credenciales y pruebas. La tabla `outbox_events` ya está preparada para publicar eventos sin acoplar la transacción de reserva.

## Fase 4 — IA asistida

`packages/ai-core` ya define:

- `AssistantProvider`;
- `ToolRegistry` con permisos y esquemas Zod;
- `ToolContext` con organización y actor.

Pasos:

1. Implementar un adaptador de proveedor (por ejemplo OpenAI) en infraestructura.
2. Registrar herramientas de sólo lectura primero: consultar agenda, buscar cliente, listar servicios.
3. Añadir herramientas de escritura con confirmación explícita del usuario.
4. Auditar cada invocación con `requestId`, actor y herramienta.
5. Probar prompt injection y acceso cruzado entre tenants.

El LLM nunca debe recibir acceso a Prisma, SQL ni IDs internos sin contexto autorizado.

## Fase 5 — Escala y producción

| Tema | Acción |
| --- | --- |
| Rate limiting distribuido | Adaptador Redis |
| Aislamiento reforzado | RLS de PostgreSQL |
| Observabilidad | OpenTelemetry, métricas, trazas | Logs, `X-Request-Id` y health checks entregados; métricas y trazas pendientes |
| Rendimiento | Pruebas de carga, índices parciales, caché de disponibilidad |
| Seguridad | MFA, verificación de email, pentest, `pnpm audit` en CI |
| Despliegue | CD, migraciones automáticas y backups programados (CI y simulacro de restore ya entregados) |
| Multi-sucursal | Evaluar jerarquía organización → sucursal |
| Facturación | Planes, límites y proveedor de pagos |

## Deuda técnica conocida

1. El rate limiting es por proceso, no distribuido.
2. No hay verificación de correo ni recuperación de contraseña.
3. Docker no se ejecutó en el entorno de construcción.
4. Las pruebas de carga y el pentest están pendientes.
5. La auditoría no tiene política de retención.
6. El frontend no tiene pruebas de componentes.
7. La reprogramación no valida reglas horarias semanales al mover un turno; replica los
   invariantes de la creación (empleado-servicio, bloqueos, buffers y solapamientos).
8. No hay métricas, trazas ni alertas externas; sólo logs, `X-Request-Id` y health checks.
9. El guard de tenant es estático y heurístico; no sustituye a RLS ni cubre SQL crudo.
10. El worker de producción requiere un host persistente y Redis; el sandbox no cuenta como despliegue.

## Orden sugerido de trabajo

```text
1. Worker BullMQ en producción (Railway recomendado)
2. Invitaciones y verificación de email (Fase 3)
3. Outbox + recordatorios por email
4. Impuestos y listas de precios
5. Adaptador de IA de sólo lectura
6. Endurecimiento para producción
```

Cada fase debe cerrar con:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:integration
pnpm test:e2e
```

y con la documentación actualizada.
