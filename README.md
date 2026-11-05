# TurnoPro

Base ejecutable de un SaaS multi-tenant para gestión de turnos y citas. El repositorio entrega la **fundación técnica** completa —autenticación, aislamiento por organización, RBAC, motor de reservas transaccional y trabajos asíncronos— y el **módulo de agenda y disponibilidad** sobre el que se construye el resto del producto.

- Repositorio: <https://github.com/Theruin117/turnopro>
- Documentación: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DATABASE.md`](docs/DATABASE.md) · [`docs/API.md`](docs/API.md) · [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Guía para agentes y colaboradores: [`AGENTS.md`](AGENTS.md)

## Qué incluye hoy

| Capacidad | Estado |
| --- | --- |
| Monorrepositorio pnpm + Turborepo | ✅ |
| Web Next.js 16 (App Router, React 19, Tailwind 4, UI propia) | ✅ |
| API REST NestJS 12 con OpenAPI | ✅ |
| PostgreSQL 16 + Prisma 6, migración inicial y seed | ✅ |
| Multi-tenancy por `organizationId` revalidado en cada petición | ✅ |
| RBAC por rol (`OWNER`, `ADMIN`, `MANAGER`, `STAFF`) | ✅ |
| Registro, login, refresh rotativo, logout, `me` | ✅ |
| Motor de reservas: idempotencia, concurrencia, solapamientos | ✅ |
| Catálogo de servicios, empleados y clientes | ✅ |
| Horario semanal, bloqueos y cálculo de slots | ✅ |
| Agenda diaria, reserva y cancelación en la web | ✅ |
| Worker BullMQ + limpieza programada + health server | ✅ |
| Dockerfile multi-etapa y Docker Compose | ✅ (no ejecutado en el entorno de desarrollo) |
| Integración real con WhatsApp / OpenAI | ⛔ fuera de alcance de esta etapa |
| Reportes, reprogramación y estados operativos | ⛔ siguiente módulo recomendado |

## Stack

- **Runtime:** Node.js 22.12+ · pnpm 12.16.1 · Turborepo 2.11
- **Frontend:** Next.js 16.4 · React 19.3 · TypeScript 5.9 · Tailwind CSS 4.3
- **Backend:** NestJS 12.3 · REST + Swagger/OpenAPI · Zod · class-validator
- **Datos:** PostgreSQL 16 · Prisma 6.19
- **Asíncrono:** Redis 7 · BullMQ 6.5 · ioredis
- **Seguridad:** Argon2id · JWT HS256 de vida corta · refresh opaco rotativo · Helmet · rate limiting
- **Pruebas:** Vitest 5 · Supertest (e2e) · pruebas de integración contra PostgreSQL real

## Estructura

```
.
├── apps
│   ├── api            # API REST NestJS
│   ├── web            # Aplicación Next.js
│   └── worker         # Procesos BullMQ y health server
├── packages
│   ├── ai-core        # Puertos de integración de IA (sin acceso a BD)
│   ├── config         # Configuración compartida de TS/ESLint
│   ├── contracts      # Tipos y esquemas de contrato público
│   ├── database       # Esquema Prisma, migraciones, seed y cliente
│   ├── shared         # Errores, RBAC, constantes y utilidades
│   └── ui             # Componentes de interfaz reutilizables
├── infrastructure     # Dockerfile y Docker Compose
├── docs               # Arquitectura, base de datos, API, seguridad, roadmap
├── scripts            # Utilidades de entorno
└── AGENTS.md
```

## Inicio rápido local

### Requisitos

- Node.js 22.12 o superior
- pnpm 10+ (el proyecto fija `12.16.1` vía Corepack)
- PostgreSQL 16 accesible por TCP
- Redis 7

### Puesta en marcha

```bash
corepack enable
corepack prepare pnpm@12.16.1 --activate

pnpm install
pnpm env:init          # crea .env con secretos aleatorios
pnpm db:generate
pnpm db:migrate        # aplica la migración inicial
pnpm db:seed           # datos ficticios de demostración

pnpm dev               # web + API + worker en paralelo
```

Servicios resultantes:

| Servicio | URL |
| --- | --- |
| Web | <http://localhost:3000> |
| API | <http://localhost:3001/api/v1> |
| Swagger | <http://localhost:3001/docs> |
| Health API | <http://localhost:3001/api/v1/health/ready> |
| Health worker | <http://localhost:3002/health/ready> |

### Credenciales de demostración

```
Correo:      owner@demo.turnopro.local
Contraseña:  TurnoProDemo123!
Organización: demo
```

Son datos **ficticios**, creados únicamente por el seed local. No representan clientes reales.

## Docker Compose

El stack incluye PostgreSQL, Redis, un servicio de migración, API, worker y web:

```bash
# Define un secreto propio antes de levantar el stack
export JWT_ACCESS_SECRET="$(openssl rand -hex 48)"

pnpm infra:up
docker compose -f infrastructure/docker-compose.yml ps
```

Para apagar y conservar los volúmenes:

```bash
pnpm infra:down
```

> **Nota de verificación:** el entorno donde se construyó esta entrega no dispone de Docker. El Dockerfile y el Compose se validaron de forma estática, pero **no se ejecutaron localmente**. Trátalos como punto de partida reproducible y ejecuta `docker compose ... up --build` en tu máquina antes de desplegar. Los detalles y variables están en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#despliegue-local-con-docker).

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Ejecuta web, API y worker en modo desarrollo |
| `pnpm dev:api` / `dev:web` / `dev:worker` | Ejecuta un solo servicio |
| `pnpm build` | Compila todos los paquetes y aplicaciones |
| `pnpm lint` | ESLint en todo el workspace |
| `pnpm typecheck` | Verificación de tipos en los 11 proyectos |
| `pnpm test` | Pruebas unitarias (sin integración) |
| `pnpm test:integration` | 5 pruebas contra PostgreSQL real |
| `pnpm test:e2e` | 10 pruebas HTTP contra la API real |
| `pnpm db:migrate` | Crea/aplica migraciones en desarrollo |
| `pnpm db:deploy` | Aplica migraciones pendientes (producción) |
| `pnpm db:seed` | Carga datos ficticios locales |
| `pnpm db:studio` | Abre Prisma Studio |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Gestiona el stack Docker |

## Verificación ejecutada

```text
pnpm lint               8/8 proyectos OK (0 errores, 57 avisos de import type)
pnpm typecheck          11/11 proyectos OK
pnpm test               20 pruebas unitarias OK
pnpm test:integration   5/5 pruebas OK
pnpm test:e2e           10/10 pruebas OK

API:    nest build OK
Worker: tsc OK
Web:    next build OK; genera .next/BUILD_ID y 11 rutas, incluidas
        /agenda, /availability y /catalog.
```

Las pruebas cubren solapamientos exactos, dos reservas concurrentes en el mismo horario, idempotencia, cancelación que libera el slot, aislamiento de lectura entre organizaciones, rechazo de cruces de tenant, paginación/validación de DTOs y el flujo de catálogo + reglas + slots + reserva + cancelación.

## Decisiones que conviene conocer

- **Un solo esquema con `organizationId`**: apropiado para esta etapa; el aislamiento se refuerza en la API y en cada consulta. Ver [`docs/SECURITY.md`](docs/SECURITY.md).
- **Reservas con transacción `SERIALIZABLE` + reintentos**: la base de datos además impone una restricción de exclusión GiST que impide solapamientos aunque la API fallara.
- **Idempotencia por organización**: cabecera `Idempotency-Key` (o campo del cuerpo) con índice único `(organizationId, idempotencyKey)`.
- **`packages/ai-core` no conoce Prisma ni la base de datos**: sólo define puertos y errores; cualquier integración futura debe pasar por la API.
- **Sin secretos en el repositorio**: `.env` está ignorado; `.env.example` sólo contiene marcadores.

## Estado y límites conocidos

1. La UI cubre landing, registro, login, panel, ajustes, equipo, agenda diaria, catálogo y disponibilidad. Reprogramación, estados operativos y reportes son el siguiente módulo recomendado.
2. WhatsApp y OpenAI no están integrados por decisión de alcance; `packages/ai-core` queda preparado con interfaces, no con llamadas simuladas.
3. El rate limiting usa almacenamiento en memoria del proceso; para varias réplicas debe moverse a Redis.
4. El correo y las invitaciones de miembros aún no envían mensajes reales.
5. Docker no se ejecutó en el entorno de construcción (ver nota arriba).

El detalle completo está en [`docs/ROADMAP.md`](docs/ROADMAP.md).
