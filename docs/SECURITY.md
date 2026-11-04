# Seguridad

## 1. Modelo de amenazas

| Activo | Amenaza principal | Mitigación |
| --- | --- | --- |
| Credenciales | Fuerza bruta, reutilización de contraseñas | Argon2id, rate limiting, contraseñas de 12+ caracteres |
| Sesión | Robo de token, XSS, CSRF | Access corto, refresh httpOnly rotativo, `SameSite=Lax`, validación de `Origin` |
| Datos de otro tenant | IDOR / consultas sin filtro | Tenant desde token, revalidación en guard, filtro obligatorio, 404 cruzado |
| Doble reserva | Carreras y reintentos | Transacción serializable, índice único, exclusión GiST |
| Integraciones | LLM con acceso directo a datos | `ai-core` sólo expone puertos y herramientas autorizadas |
| Secretos | Commits accidentales | `.gitignore`, `.env.example` con marcadores, `pnpm env:init` |
| Disponibilidad | Abuso de endpoints | Rate limiting, límites de tamaño de payload, timeouts |

Fuera de alcance de esta etapa: fraude de pago, cumplimiento formal (GDPR/HIPAA), pentesting externo, WAF y DDoS a nivel de red.

## 2. Autenticación

### Contraseñas

- Hash **Argon2id** con parámetros por defecto de `@node-rs/argon2`.
- Longitud mínima 12, máxima 128.
- Nunca se registran en logs ni se devuelven.
- El seed usa una contraseña ficticia sólo para desarrollo.

### Access token

- JWT HS256 firmado con `JWT_ACCESS_SECRET` (mínimo 32 caracteres).
- Vida por defecto: 900 segundos.
- Contiene `sub`, `org`, `mid`, `role`, `type: "access"`.
- Se envía en `Authorization: Bearer`.
- No se almacena en cookies ni en base de datos.

### Refresh token

- Valor opaco de alta entropía; en base de datos sólo se guarda SHA-256.
- Cookie `httpOnly`, `SameSite=Lax`, `path=/api/v1/auth`, `Secure` en producción.
- Rotación en cada uso; el token anterior queda marcado como reemplazado.
- Si se detecta reutilización de un token ya rotado, se revoca **toda la familia** y se responde `TOKEN_REUSED`.
- Logout revoca la familia y limpia la cookie.

### CSRF

El access token viaja en cabecera, por lo que no es vulnerable a CSRF clásico. Los endpoints que dependen de la cookie (`refresh`, `logout`) exigen `Origin` permitido mediante `OriginGuard`. Un origen ausente se rechaza con `403`.

### Por qué no se usa refresh en `localStorage`

Porque cualquier XSS podría leerlo y exfiltrarlo. La cookie `httpOnly` no es accesible desde JavaScript. El coste es requerir protección CSRF explícita, que ya está implementada.

## 3. Autorización

### RBAC

La matriz estática en `packages/shared/src/rbac.ts` asigna permisos a `OWNER`, `ADMIN`, `MANAGER` y `STAFF`. Cada controlador declara los permisos requeridos con `@RequirePermissions`.

El guard global:

1. Exige un access token válido salvo rutas marcadas `@Public()`.
2. Carga la membresía desde la base de datos usando `sub` + `org`.
3. Verifica usuario `ACTIVE`, membresía `ACTIVE` y organización `ACTIVE`.
4. Adjunta el contexto autenticado a la petición.

Esto significa que suspender una membresía o desactivar un usuario surte efecto de inmediato, sin esperar a que expire el JWT.

### Aislamiento multi-tenant

- El `organizationId` nunca se acepta desde el cliente.
- Todas las consultas de negocio incluyen `organizationId`.
- Los recursos de otro tenant responden `404` para no revelar su existencia.
- Las escrituras verifican que las entidades relacionadas pertenezcan al mismo tenant.
- Las pruebas e2e incluyen lectura, cancelación y creación cruzada entre dos organizaciones.

### Defensa en profundidad pendiente

Hoy el aislamiento depende de disciplina en las consultas. Para una etapa posterior se recomienda:

- Row Level Security (RLS) de PostgreSQL con `SET LOCAL app.organization_id`;
- un lint personalizado que detecte `findMany`/`findFirst` sin `organizationId`;
- pruebas de contrato que recorran todos los endpoints con dos tenants.

## 4. Validación de entrada

- `ValidationPipe` global con `whitelist: true` y `forbidNonWhitelisted: true`: los campos desconocidos se rechazan.
- DTOs con `class-validator` y transformación explícita.
- Esquemas Zod en `packages/contracts` para el frontend.
- Fechas ISO 8601 con zona horaria; se rechazan fechas pasadas al reservar.
- UUIDs validados con `ParseUUIDPipe` en parámetros.
- Paginación acotada (`pageSize` máximo 100).
- Claves de idempotencia con regex y longitud máxima.
- Zona horaria y moneda validadas contra catálogos.

## 5. Protección de datos

- Prisma usa consultas parametrizadas; no hay SQL concatenado con entrada de usuario.
- La restricción de exclusión y los checks se aplican en la base.
- Los logs de `pino` redactan `authorization`, `cookie`, `set-cookie`, `password` y `token`.
- Las respuestas de autenticación llevan `Cache-Control: no-store`.
- Helmet agrega cabeceras de seguridad; CSP se desactiva porque la API no sirve HTML.
- CORS restringido a los orígenes configurados, con credenciales y cabeceras explícitas.
- Límite de payload por defecto de Express (100 kb) suficiente para estos DTOs.

## 6. Rate limiting

Implementado con `@nestjs/throttler`:

| Endpoint | Límite |
| --- | --- |
| Registro | 5/minuto |
| Login | 10/minuto |
| Refresh | 60/minuto |
| Logout | 30/minuto |
| Resto | 100/minuto configurable |

**Limitación:** el almacenamiento es en memoria del proceso. Con varias réplicas el límite efectivo se multiplica. Para producción se debe usar el adaptador de Redis (`@nest-lab/throttler-storage-redis` o equivalente) manteniendo las mismas claves.

## 7. Registro y auditoría

- Logs estructurados JSON con nivel configurable.
- `X-Request-Id` en cada petición y respuesta.
- `audit_logs` registra:
  - `appointment.created`;
  - `appointment.cancelled`;
  - `organization.updated`.
- La auditoría incluye actor, organización, entidad, metadatos, IP y user-agent.
- No se audita el replay idempotente para no duplicar eventos.
- Los errores internos se registran completos en servidor, pero el cliente sólo recibe `INTERNAL_ERROR`.

## 8. Secretos y configuración

Variables sensibles:

```
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
COOKIE_DOMAIN
SEED_OWNER_PASSWORD
```

Reglas:

- `.env` está ignorado por Git.
- `.env.example` sólo contiene marcadores.
- `pnpm env:init` genera secretos aleatorios y no los imprime completos.
- En producción, `JWT_ACCESS_SECRET` debe tener al menos 32 caracteres y rotarse de forma planificada.
- `COOKIE_SECURE=true` es obligatorio con HTTPS.
- El Compose incluye un secreto por defecto **sólo para desarrollo**; debe sobrescribirse.
- No se deben reutilizar credenciales de demo en producción.

> Durante la preparación de esta entrega se utilizó una credencial de GitHub para publicar el repositorio. Esa credencial es externa al proyecto, no está en el código y **debe revocarse** una vez finalizada la entrega.

## 9. Docker

- Imagen base `node:22-bookworm-slim` con sólo `ca-certificates` y `openssl`.
- El proceso corre como usuario `node`, no como root.
- `.dockerignore` excluye `.env`, `.git`, `node_modules`, artefactos y logs.
- No se copian secretos al contexto de build.
- El servicio de migración termina antes de arrancar API y worker.
- Para producción se recomienda además:
  - fijar imágenes por digest;
  - escanear con Trivy/Grype;
  - usar un usuario sin shell;
  - montar secretos como archivos o variables del orquestador;
  - limitar CPU/memoria y aplicar `read_only` donde sea posible.

## 10. Pruebas de seguridad incluidas

| Prueba | Qué demuestra |
| --- | --- |
| Lectura cruzada de turno | `404` en lugar de filtrar datos |
| Cancelación cruzada | `404` |
| Creación con entidades de otro tenant | `404` |
| Reutilización de clave idempotente con otros datos | `409` |
| Dos reservas concurrentes | Sólo una gana |
| Cancelación libera el slot | No hay bloqueo permanente |
| Login con credenciales inválidas | `401` sin filtrar qué campo falló |

## 11. Riesgos residuales y recomendaciones

1. **Rate limiting en memoria:** mover a Redis antes de escalar horizontalmente.
2. **Sin RLS:** añadir como defensa adicional cuando el número de consultas crezca.
3. **Sin verificación de email:** un atacante podría registrar correos ajenos. Añadir flujo de verificación antes de producción.
4. **Sin MFA:** recomendable para roles `OWNER`/`ADMIN`.
5. **Sin revocación global de access tokens:** el access dura 15 minutos; aceptable, pero considerar lista de revocación si se requiere corte inmediato.
6. **Sin política de retención de auditoría:** definir retención y exportación.
7. **Sin CSP en la web:** la API no sirve HTML, pero la web debe configurar CSP en su despliegue.
8. **Sin pruebas de penetración:** realizar antes de abrir a clientes reales.
9. **Dependencias:** ejecutar `pnpm audit` y actualizar de forma programada.
10. **Docker no ejecutado en el entorno de entrega:** validar el stack en un host real.

## 12. Respuesta ante incidentes

1. Rotar `JWT_ACCESS_SECRET` (invalida todos los access tokens).
2. Revocar familias de refresh afectadas en `refresh_tokens`.
3. Desactivar usuarios o membresías comprometidas.
4. Revisar `audit_logs` y logs con el `requestId` afectado.
5. Rotar credenciales de base de datos y Redis.
6. Documentar el incidente y las acciones en `docs/`.
