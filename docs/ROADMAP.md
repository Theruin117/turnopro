# Roadmap

## Estado actual

La fundación está entregada y verificada:

- monorrepositorio pnpm + Turborepo;
- web Next.js con registro, login, panel, ajustes y equipo;
- API NestJS con OpenAPI;
- PostgreSQL + Prisma con migración inicial y seed;
- multi-tenancy y RBAC;
- motor de reservas idempotente y resistente a concurrencia;
- worker BullMQ con limpieza programada;
- Dockerfile y Compose preparados;
- 10 pruebas automatizadas pasando (5 de integración + 5 e2e);
- documentación de arquitectura, base de datos, API, seguridad y operación.

## Siguiente módulo recomendado: agenda y disponibilidad

Es el siguiente paso de mayor valor porque convierte el motor de reservas ya probado en una experiencia usable.

### Alcance

1. **CRUD de servicios** (`services:read/write`)
   - nombre, duración, buffers, precio, estado;
   - validación de solapamientos de nombre por organización.
2. **CRUD de empleados** (`employees:read/write`)
   - datos básicos y color;
   - vínculo con servicios;
   - activación/desactivación.
3. **Reglas de disponibilidad**
   - horario semanal por empleado;
   - excepciones (`time_off`);
   - validación de rangos.
4. **Endpoint de slots disponibles**
   - `GET /appointments/availability?employeeId=&serviceId=&date=`;
   - calcula intersección de disponibilidad, `time_off`, buffers y turnos existentes;
   - usa la zona horaria de la organización;
   - no reserva, sólo propone.
5. **UI de agenda**
   - vista diaria/semanal;
   - selección de cliente, servicio, empleado y slot;
   - creación idempotente desde el frontend;
   - cancelación con confirmación;
   - estados vacíos y errores reales, sin botones simulados.
6. **Clientes**
   - búsqueda y alta rápida desde la agenda;
   - evitar duplicados por teléfono.

### Criterios de aceptación

- Un usuario `STAFF` puede ver la agenda y crear/cancelar turnos.
- Un usuario `MANAGER` puede además editar servicios y empleados.
- Un `STAFF` no puede acceder a ajustes de organización ni a equipo.
- Los slots propuestos respetan buffers, `time_off` y turnos existentes.
- Dos pestañas que reservan el mismo slot: sólo una recibe `201`, la otra `409`.
- Reintentar la creación con la misma clave devuelve el mismo turno.
- La agenda muestra la zona horaria de la organización, no la del navegador.
- Pruebas e2e cubren aislamiento entre dos organizaciones.

### Riesgos y decisiones pendientes

- Definir si un turno puede cruzar la medianoche.
- Definir granularidad de slots (5, 10, 15 minutos).
- Decidir si la disponibilidad se calcula en SQL o en servicio; se recomienda SQL para evitar traer demasiados datos.
- Evaluar caché de disponibilidad en Redis; invalidar al crear/cancelar.

## Fase 2 — Operación del negocio

| Módulo | Alcance | Dependencias |
| --- | --- | --- |
| Clientes | CRUD, historial, búsqueda, notas | Agenda |
| Servicios y precios | Catálogo completo, impuestos | Agenda |
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
3. La UI no tiene agenda todavía.
4. Docker no se ejecutó en el entorno de construcción.
5. No hay CI configurado en el repositorio.
6. Las pruebas de carga y el pentest están pendientes.
7. La auditoría no tiene pantalla ni política de retención.
8. El frontend no tiene pruebas de componentes.

## Orden sugerido de trabajo

```text
1. Agenda + disponibilidad + CRUD servicios/empleados
2. Clientes
3. Invitaciones y verificación de email
4. Reportes y auditoría visible
5. Outbox + recordatorios por email
6. Adaptador de IA de sólo lectura
7. Endurecimiento para producción
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
