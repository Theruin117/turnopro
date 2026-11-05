# Roadmap

## Estado actual

La fundación y el primer módulo de negocio están entregados y verificados:

- monorrepositorio pnpm + Turborepo;
- web Next.js con registro, login, panel, ajustes, equipo, agenda, catálogo y disponibilidad;
- API NestJS con OpenAPI;
- PostgreSQL + Prisma con migración inicial y seed;
- multi-tenancy y RBAC;
- motor de reservas idempotente y resistente a concurrencia;
- CRUD de servicios, empleados y clientes con archivado/desactivación;
- horario semanal por empleado, bloqueos puntuales y cálculo de slots;
- worker BullMQ con limpieza programada;
- Dockerfile y Compose preparados;
- 35 pruebas automatizadas pasando (20 unitarias + 5 de integración + 10 e2e);
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

## Siguiente módulo recomendado: operación del negocio

El siguiente paso de mayor valor es convertir la agenda en operación diaria completa:

### Alcance

1. **Historial de clientes**: turnos pasados, notas y búsqueda por teléfono.
2. **Reprogramación**: mover un turno validando de nuevo el slot y la idempotencia.
3. **Estados operativos**: confirmar, completar y marcar `NO_SHOW` desde la agenda.
4. **Reportes básicos**: ocupación por empleado, ingresos estimados y cancelaciones.
5. **Auditoría visible** para `ADMIN`/`OWNER` con filtros por entidad y fecha.
6. **Recordatorios**: outbox + worker + email transaccional real.

### Criterios de aceptación

- Reprogramar no permite solapamientos ni deja el slot anterior bloqueado.
- Los reportes filtran por organización y rango de fechas.
- Un `STAFF` no accede a reportes ni auditoría.
- Los recordatorios no se marcan como enviados si el proveedor falla.
- Pruebas e2e cubren aislamiento y transiciones de estado inválidas.

### Riesgos y decisiones pendientes

- Definir política de reprogramación (límite de tiempo, quién puede hacerlo).
- Decidir si los reportes se calculan en SQL o con vistas materializadas.
- Evaluar caché de disponibilidad en Redis; invalidar al crear, cancelar o reprogramar.
- Definir plantillas de correo y proveedor antes de implementar recordatorios.

## Fase 2 — Operación del negocio

| Módulo | Alcance | Dependencias |
| --- | --- | --- |
| Historial de clientes | Turnos pasados, notas y búsqueda (CRUD ya entregado) | Agenda |
| Servicios y precios | Impuestos y listas de precios (catálogo base ya entregado) | Agenda |
| Equipo e invitaciones | Invitar por correo, aceptar, suspender | Email |
| Reportes | Ocupación, ingresos, cancelaciones | Turnos |
| Auditoría visible | Pantalla de actividad para `ADMIN`/`OWNER` | Auditoría |

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
| Observabilidad | OpenTelemetry, métricas, trazas |
| Rendimiento | Pruebas de carga, índices parciales, caché de disponibilidad |
| Seguridad | MFA, verificación de email, pentest, `pnpm audit` en CI |
| Despliegue | CI/CD, migraciones automáticas, backups y restauración probada |
| Multi-sucursal | Evaluar jerarquía organización → sucursal |
| Facturación | Planes, límites y proveedor de pagos |

## Deuda técnica conocida

1. El rate limiting es por proceso, no distribuido.
2. No hay verificación de correo ni recuperación de contraseña.
3. La agenda no permite reprogramar ni cambiar estados operativos (`CONFIRMED`, `COMPLETED`, `NO_SHOW`).
4. Docker no se ejecutó en el entorno de construcción.
5. No hay CI configurado en el repositorio.
6. Las pruebas de carga y el pentest están pendientes.
7. La auditoría no tiene pantalla ni política de retención.
8. El frontend no tiene pruebas de componentes.

## Orden sugerido de trabajo

```text
1. Historial de clientes y reprogramación
2. Reportes y auditoría visible
3. Invitaciones y verificación de email
4. Outbox + recordatorios por email
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
