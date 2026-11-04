# AGENTS.md

Guía de trabajo para agentes y personas que modifiquen TurnoPro. El objetivo es preservar las garantías de seguridad, aislamiento multi-tenant y consistencia del motor de reservas.

## Principios no negociables

1. **El tenant sale del token, nunca del cliente.** La organización activa se obtiene del access token y se revalida contra la base de datos en cada petición. No aceptes `organizationId` desde body, query o path para decidir el tenant.
2. **Toda consulta de negocio filtra por `organizationId`.** Incluso si el identificador es un UUID, un recurso de otra organización debe responder `404`, no `403`.
3. **La autorización es por permiso, no sólo por rol.** Usa `@RequirePermissions('...')` en cada endpoint nuevo. La matriz vive en `packages/shared/src/rbac.ts`.
4. **Las reservas no se validan sólo en aplicación.** Mantén la transacción `SERIALIZABLE`, el reintento ante `40001`/`P2034`, el índice único de idempotencia y la restricción de exclusión de PostgreSQL.
5. **`packages/ai-core` no accede a la base de datos.** Define puertos, tipos y errores; la orquestación y persistencia pertenecen a la API.
6. **No inventes funcionalidad.** Si una integración no está implementada, no agregues botones, endpoints ni respuestas simuladas. Documéntalo como pendiente.
7. **Nunca commitees secretos.** `.env` está ignorado; usa `.env.example` con marcadores y `pnpm env:init` para generar valores locales.
8. **No dejes errores de compilación, lint o tipos.** Antes de cerrar un cambio ejecuta la lista de verificación.

## Mapa del repositorio

| Ruta | Responsabilidad |
| --- | --- |
| `apps/api/src/modules/*` | Módulos NestJS por dominio |
| `apps/api/src/common` | Guards, decoradores, filtros y tipos HTTP |
| `apps/api/src/infrastructure` | Prisma, Redis, logging |
| `apps/api/test/e2e` | Pruebas HTTP de extremo a extremo |
| `apps/web/app` | Rutas del App Router |
| `apps/web/components` | Componentes y providers de la web |
| `apps/web/lib` | Cliente HTTP y utilidades |
| `apps/worker/src` | Worker BullMQ y health server |
| `packages/database/prisma` | Esquema, migraciones y seed |
| `packages/database/test` | Pruebas de integración con PostgreSQL |
| `packages/contracts` | Tipos y esquemas compartidos con el frontend |
| `packages/shared` | Errores, RBAC, constantes, validaciones |
| `infrastructure` | Dockerfile y Docker Compose |

## Comandos habituales

```bash
pnpm install
pnpm env:init
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev

pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:integration
pnpm test:e2e
```

Notas:

- El build de la API es intensivo en memoria. Si el proceso muere por heap, usa `NODE_OPTIONS=--max-old-space-size=1024 pnpm build`.
- `pnpm test` excluye las pruebas de integración; éstas se ejecutan con `pnpm test:integration`.
- Las pruebas e2e y de integración requieren PostgreSQL y Redis disponibles y un `.env` cargado.

## Cómo agregar un módulo de negocio

1. Crea `apps/api/src/modules/<dominio>/` con `controller`, `service`, `module` y `dto/`.
2. Registra el módulo en `apps/api/src/app.module.ts`.
3. Declara permisos nuevos en `packages/shared/src/rbac.ts` y asígnalos en la matriz de roles.
4. Protege cada endpoint con `@RequirePermissions`. Recuerda que el guard global ya exige autenticación salvo `@Public()`.
5. Filtra siempre por la organización inyectada con `@CurrentOrganization()`.
6. Añade tipos de contrato en `packages/contracts` si el frontend los consume.
7. Registra auditoría para acciones sensibles con `AuditService`.
8. Añade pruebas e2e que incluyan un intento de acceso cruzado entre organizaciones.

### Convenciones de código

- TypeScript estricto (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`).
- Nombres de dominio en inglés en el código; mensajes de error y documentación en español.
- DTOs con `class-validator` + decoradores de Swagger; esquemas de contrato con Zod.
- Errores de negocio con `AppError(ErrorCode.*, status, mensaje, detalles?)`.
- No devuelvas entidades Prisma crudas: mapea a los tipos de `@turnopro/contracts`.
- Formato con Prettier; lint con ESLint 9.

## Reglas de base de datos

- El esquema vive en `packages/database/prisma/schema.prisma`.
- Las migraciones son inmutables una vez aplicadas. Crea una nueva carpeta con timestamp; no edites la anterior.
- Toda tabla de negocio debe incluir `organizationId` y una FK a `organizations`.
- Añade índices compuestos que empiecen por `organizationId` cuando la consulta sea por tenant.
- Las restricciones críticas (rangos, exclusiones, unicidad de idempotencia) se implementan en SQL, no sólo en Prisma.
- El seed sólo puede contener datos ficticios y debe ser idempotente.
- Para pruebas usa identificadores aleatorios y limpia los datos creados.

### Problemas conocidos del entorno

En algunos entornos contenedorizados el motor de Prisma falla al hablar con su schema engine (`Could not parse schema engine response`). Si ocurre:

1. Aplica el SQL manualmente con `psql`.
2. Marca la migración como aplicada con `prisma migrate resolve --applied <nombre>`.
3. Verifica con `prisma migrate status`.

No es un problema del esquema ni de la aplicación; documenta el workaround en el PR.

## Reglas del motor de reservas

Archivo central: `apps/api/src/modules/appointments/appointments.service.ts`.

Invariantes que no deben romperse:

- La creación ocurre dentro de una transacción con `isolationLevel: Serializable`.
- Se reintenta ante fallos de serialización (`P2034`, `40001`, `40P01`), con un máximo acotado.
- La clave de idempotencia es única por organización y debe devolver el mismo turno ante reintentos idénticos.
- Reutilizar la clave con datos distintos devuelve `409 IDEMPOTENCY_CONFLICT`.
- El empleado debe pertenecer a la organización y ofrecer el servicio.
- Los buffers del servicio extienden el rango bloqueado; los solapamientos se evalúan sobre `blockedFromAt`/`blockedUntilAt`.
- Cancelar un turno libera el slot. Un turno completado no se puede cancelar.
- Los turnos con estado `CANCELLED` quedan fuera de la restricción de exclusión.

Si tocas estas reglas, actualiza también:

- `packages/database/prisma/migrations/20261104000000_init/migration.sql`
- `packages/database/test/database.integration.test.ts`
- `apps/api/test/e2e/appointments.e2e.test.ts`
- `docs/DATABASE.md` y `docs/API.md`

## Seguridad

- No registres tokens, contraseñas ni cuerpos completos en logs.
- Mantén `Cache-Control: no-store` en respuestas de autenticación.
- El refresh token viaja en cookie `httpOnly`, `SameSite=Lax`, con `path=/api/v1/auth`.
- `refresh` y `logout` validan el origen con `OriginGuard`.
- Cualquier nueva cabecera usada por el frontend debe agregarse a `allowedHeaders` en `apps/api/src/app.setup.ts` y a la configuración CORS.
- No agregues dependencias sin justificar el reemplazo de la tecnología pedida.

## Verificación antes de cerrar un cambio

```bash
pnpm lint
pnpm typecheck
NODE_OPTIONS=--max-old-space-size=1024 pnpm build
pnpm test
pnpm test:integration
pnpm test:e2e
```

Si Docker está disponible:

```bash
docker compose -f infrastructure/docker-compose.yml build
docker compose -f infrastructure/docker-compose.yml up -d
docker compose -f infrastructure/docker-compose.yml ps
```

## Entrega

- Commits pequeños y descriptivos, en español o inglés consistente con el historial.
- Un cambio relevante debe actualizar la documentación afectada.
- El repositorio remoto es `Theruin117/turnopro`; la rama principal es `main`.
