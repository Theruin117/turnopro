'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@turnopro/ui';

import { useAuth } from '@/components/providers/auth-provider';
import { ApiError } from '@/lib/api';

interface OrganizationChoice {
  slug: string;
  name: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { session, status, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationChoice[]>([]);

  useEffect(() => {
    if (status !== 'loading' && session) {
      router.replace('/dashboard');
    }
  }, [router, session, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setOrganizations([]);

    try {
      await login({
        email,
        password,
        ...(organizationSlug.trim() ? { organizationSlug: organizationSlug.trim() } : {}),
      });
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
        const details = cause.details as
          | { organizations?: OrganizationChoice[] }
          | undefined;
        setOrganizations(details?.organizations ?? []);
      } else {
        setError('No se pudo iniciar sesión. Revisa la conexión con la API.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
      <div className="max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight">Inicia sesión en tu organización</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          El access token vive solo en memoria. La sesión se recupera con una cookie
          httpOnly rotativa, por lo que recargar la página no expone credenciales al
          JavaScript de la aplicación.
        </p>
        <div className="mt-8 rounded-xl border bg-card p-4 text-sm">
          <p className="font-medium">Cuenta de demostración local</p>
          <p className="mt-1 text-muted-foreground">
            owner@demo.turnopro.local · TurnoProDemo123!
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Solo si ejecutaste <code className="rounded bg-muted px-1">pnpm db:seed</code>.
            Son datos ficticios.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credenciales</CardTitle>
          <CardDescription>
            Si perteneces a varias organizaciones, indica el identificador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organizationSlug">
                Organización <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="organizationSlug"
                name="organizationSlug"
                placeholder="mi-negocio"
                autoComplete="organization"
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(event.target.value)}
              />
              {organizations.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {organizations.map((organization) => (
                    <Button
                      key={organization.slug}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOrganizationSlug(organization.slug)}
                    >
                      {organization.name} · {organization.slug}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo iniciar sesión</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button className="w-full" type="submit" loading={submitting}>
              Entrar
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            ¿Aún no tienes cuenta?{' '}
            <Link
              href="/register"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Crea tu organización
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
