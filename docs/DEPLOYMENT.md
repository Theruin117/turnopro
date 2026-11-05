# Despliegue en Supabase y Vercel

Procedimiento para publicar TurnoPro con la base de datos en Supabase y la web
y la API en Vercel. El worker BullMQ no corre en Vercel y queda en otro host.

## Arquitectura del despliegue

| Componente | Host | Notas |
| --- | --- | --- |
| PostgreSQL | Supabase | Migración y seed con Prisma |
| Web (Next.js) | Vercel | Proyecto `turnopro-web`, root `apps/web` |
| API (NestJS) | Vercel | Una función catch-all `api/[...path].js` |
| Worker (BullMQ) | Pendiente | Requiere un host con Redis y procesos persistentes |

La API usa un único handler serverless que crea el contenedor Nest en la
primera invocación y lo reutiliza mientras la instancia esté tibia. No se llama
a `listen`: Vercel entrega `req`/`res` nativos de Node.

## 1. Supabase

### Conexiones

Supabase ofrece dos cadenas y se usan para fines distintos:

| Uso | Puerto | Cadena |
| --- | --- | --- |
| Migraciones y seed | `5432` | Session pooler (`aws-0-<region>.pooler.supabase.com`) o conexión directa (`db.<ref>.supabase.co`) |
| Runtime de la API | `6543` | Transaction pooler con `?pgbouncer=true` |

Las migraciones no deben ejecutarse contra el transaction pooler. La conexión
directa suele ser IPv6; si la red del entorno no tiene IPv6, usa el session
pooler en `5432`.

Ejemplo de variables:

```bash
# Migraciones (session pooler)
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"

# Runtime (transaction pooler)
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
```

### Migración

`prisma migrate deploy` lee `DATABASE_URL`. Para migrar sin cambiar el runtime:

```bash
DATABASE_URL="$DIRECT_URL" pnpm --filter @turnopro/database exec prisma migrate deploy
```

Si el motor de Prisma falla con `Could not parse schema engine response`,
aplica el SQL de `packages/database/prisma/migrations/20261104000000_init/migration.sql`
con `psql` y marca la migración como aplicada:

```bash
psql "$DIRECT_URL" -f packages/database/prisma/migrations/20261104000000_init/migration.sql
DATABASE_URL="$DIRECT_URL" pnpm --filter @turnopro/database exec prisma migrate resolve --applied 20261104000000_init
```

### Seed de demostración

El seed sólo contiene datos ficticios y es idempotente. Se niega a ejecutarse
con `NODE_ENV=production`, así que se invoca con `NODE_ENV=development`:

```bash
NODE_ENV=development DATABASE_URL="$DIRECT_URL" pnpm --filter @turnopro/database exec prisma db seed
```

Credenciales ficticias por defecto:

- Email: `owner@demo.turnopro.local`
- Contraseña: `TurnoProDemo123!`
- Organización: `demo`

### Endurecimiento de la Data API

La aplicación accede con Prisma como rol privilegiado. Los roles `anon` y
`authenticated` de Supabase no se usan, así que se bloquean:

```bash
psql "$DIRECT_URL" -f packages/database/prisma/supabase-hardening.sql
```

El script activa RLS en todas las tablas de `public`, revoca privilegios de
`anon`/`authenticated` y revoca los privilegios por defecto para tablas
futuras. Es idempotente. Verifícalo con:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Todas las filas deben mostrar `rowsecurity = true`.

## 2. API en Vercel

Proyecto `turnopro-api`:

- Root directory: raíz del repositorio.
- Framework: sin preset.
- Install: `pnpm install --frozen-lockfile`.
- Build: `pnpm exec turbo run build --filter=@turnopro/api`.
- Función: `api/[...path].js`, 1024 MB y 60 s (`vercel.json`).

Variables de entorno (Production and Preview):

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Transaction pooler de Supabase (`6543`, `pgbouncer=true`) |
| `JWT_ACCESS_SECRET` | Secreto aleatorio de al menos 32 caracteres |
| `WEB_ORIGIN` | URL de la web, por ejemplo `https://turnopro-web.vercel.app` |
| `COOKIE_SECURE` | `true` |
| `SWAGGER_ENABLED` | `false` |
| `LOG_LEVEL` | `info` |
| `TRUST_PROXY` | `true` |

`REDIS_URL` es opcional en la API. Si no se define, `/health/ready` responde
`degraded` con Redis como dependencia no configurada, pero el resto de la API
funciona. El worker sí necesita Redis y no puede desplegarse en Vercel.

```bash
vercel link --project turnopro-api
vercel env add DATABASE_URL production
vercel env add JWT_ACCESS_SECRET production
vercel env add WEB_ORIGIN production
vercel env add COOKIE_SECURE production
vercel deploy --prod
```

## 3. Web en Vercel

Proyecto `turnopro-web`:

- Root directory: `apps/web` (Vercel detecta el monorepo pnpm).
- Framework: Next.js.
- Variables de entorno:

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `/api/v1` |
| `API_PROXY_TARGET` | `https://turnopro-api.vercel.app` |

La web proxya `/api/v1/*` hacia la API con un `rewrite` de Next.js. Es
necesario porque `turnopro-web.vercel.app` y `turnopro-api.vercel.app` son
sitios distintos para el navegador: una cookie `SameSite=Lax` no viajaría en
peticiones cross-site. Con el proxy, el navegador habla con el mismo origen y
la cookie del refresh token funciona.

```bash
vercel link --project turnopro-web --cwd apps/web
vercel env add NEXT_PUBLIC_API_URL production
vercel env add API_PROXY_TARGET production
vercel deploy --prod
```

`NEXT_PUBLIC_API_URL` se inlinea en el bundle del cliente: cambiarla exige
volver a desplegar la web. Si algún día la web y la API comparten un dominio
registrable (por ejemplo `app.turnopro.com` y `api.turnopro.com`), el proxy
puede eliminarse y apuntar `NEXT_PUBLIC_API_URL` directo a la API.

## 4. Orden recomendado

1. Migrar y sembrar la base en Supabase.
2. Aplicar el endurecimiento de la Data API.
3. Desplegar la API y comprobar `GET /api/v1/health/live`.
4. Desplegar la web con la URL de la API.
5. Actualizar `WEB_ORIGIN` de la API con la URL final de la web y redesplegar.
6. Probar login, agenda y creación de un turno.

## 5. Verificación

```bash
curl -i https://<api>.vercel.app/api/v1/health/live
curl -i https://<api>.vercel.app/api/v1/health/ready
curl -i -X POST https://<api>.vercel.app/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@demo.turnopro.local","password":"TurnoProDemo123!"}'
```

Comprobaciones:

- `health/live` responde `200` con `status: ok`.
- `health/ready` responde `200`; Redis aparece como no configurado/`down`.
- El login devuelve `accessToken` y la cookie `refresh_token` con
  `HttpOnly`, `Secure` y `SameSite=Lax`.
- La web carga la agenda con los datos del seed.
- Un recurso de otra organización responde `404`.

## 6. Límites conocidos

- El worker BullMQ no se despliega en Vercel.
- Las tareas programadas dependen del worker; en Vercel no hay proceso
  persistente.
- Las funciones serverless abren conexiones nuevas al pooler; usa
  `connection_limit=1` en `DATABASE_URL`.
- Cambiar el esquema requiere una migración nueva y volver a desplegar.
