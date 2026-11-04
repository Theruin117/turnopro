import Link from 'next/link';

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, buttonVariants } from '@turnopro/ui';

const capabilities = [
  {
    title: 'Aislamiento por organización',
    description:
      'Cada membresía, servicio, empleado y cita pertenece a una organización. El tenant se deriva del token y se revalida contra PostgreSQL en cada solicitud.',
  },
  {
    title: 'Autorización por rol',
    description:
      'Owner, admin, manager y staff tienen permisos explícitos. Los guards aplican RBAC en el servidor; la interfaz solo oculta acciones que la API ya bloquea.',
  },
  {
    title: 'Sesiones endurecidas',
    description:
      'Access token de corta vida, refresh token opaco en cookie httpOnly con rotación y detección de reutilización por familia.',
  },
  {
    title: 'Base para agenda sin duplicados',
    description:
      'El diseño usa transacciones serializables, restricciones de exclusión en PostgreSQL e idempotencia por organización para resistir concurrencia.',
  },
  {
    title: 'Integraciones aisladas',
    description:
      'El paquete ai-core define herramientas sin acceso a la base. Las integraciones externas se conectarán mediante adaptadores y outbox, no desde el dominio.',
  },
  {
    title: 'Operación observable',
    description:
      'API y worker exponen liveness/readiness reales, logging estructurado, auditoría persistida y un esquema Prisma versionado con migraciones.',
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_35%),radial-gradient(circle_at_85%_10%,color-mix(in_oklab,var(--warning)_12%,transparent),transparent_30%)]" />
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:py-28">
          <div>
            <Badge variant="secondary" className="mb-5">
              Fundación técnica · v0.1
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              La base multi-tenant para gestionar turnos con reglas claras.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              TurnoPro separa autenticación, permisos, datos por organización y trabajos
              asíncronos desde el primer día. Esta entrega es una fundación ejecutable:
              registro, sesión, organización, equipo y salud del sistema.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonVariants({ size: 'lg' })}>
                Crear una organización
              </Link>
              <Link
                href="/login"
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
              >
                Iniciar sesión
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No se integran aún WhatsApp ni modelos de IA. No hay botones ni métricas
              simuladas.
            </p>
          </div>

          <Card className="self-start border-primary/15 bg-card/80 shadow-lg backdrop-blur">
            <CardHeader>
              <CardTitle>Qué ya funciona</CardTitle>
              <CardDescription>Flujo verificado de extremo a extremo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                'Registro transaccional de organización + owner',
                'Login con selección de organización',
                'Refresh con rotación y detección de reutilización',
                'Organización y equipo leídos desde la API',
                'Health checks de PostgreSQL y Redis',
                'Worker BullMQ de mantenimiento',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    ✓
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Decisiones que sostienen el producto
          </h2>
          <p className="mt-3 text-muted-foreground">
            La arquitectura prioriza aislamiento, trazabilidad y una agenda que no pueda
            duplicar reservas bajo concurrencia.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability) => (
            <Card key={capability.title}>
              <CardHeader>
                <CardTitle>{capability.title}</CardTitle>
                <CardDescription className="leading-6">
                  {capability.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-secondary/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Siguiente paso: motor de reservas</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              La base ya incluye el modelo de servicios, empleados, disponibilidad, clientes
              y citas. El siguiente módulo implementará disponibilidad y creación de reservas
              sobre estas garantías.
            </p>
          </div>
          <Link href="/register" className={buttonVariants({ size: 'lg' })}>
            Probar la fundación
          </Link>
        </div>
      </section>
    </>
  );
}
