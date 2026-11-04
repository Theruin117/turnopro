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

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

export default function RegisterPage() {
  const router = useRouter();
  const { session, status, register } = useAuth();
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && session) {
      router.replace('/dashboard');
    }
  }, [router, session, status]);

  function handleOrganizationName(value: string): void {
    setOrganizationName(value);
    if (!slugEdited) {
      setOrganizationSlug(slugify(value));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await register({
        organizationName: organizationName.trim(),
        organizationSlug: organizationSlug.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
      });
      router.replace('/dashboard');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'No se pudo crear la cuenta. Revisa la conexión con la API.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
      <div className="max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight">Crea tu organización</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          El registro crea en una sola transacción la organización, tu usuario y la
          membresía OWNER. El identificador será único y visible en la URL de acceso.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
          <li>• Contraseña mínima de 12 caracteres con hash Argon2id.</li>
          <li>• Aislamiento por organización desde el primer registro.</li>
          <li>• Sesión con refresh token httpOnly y rotación.</li>
        </ul>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la cuenta</CardTitle>
          <CardDescription>Todos los campos son obligatorios.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organizationName">Nombre del negocio</Label>
                <Input
                  id="organizationName"
                  autoComplete="organization"
                  required
                  minLength={2}
                  maxLength={80}
                  value={organizationName}
                  onChange={(event) => handleOrganizationName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizationSlug">Identificador</Label>
                <Input
                  id="organizationSlug"
                  required
                  minLength={3}
                  maxLength={48}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  title="Solo minúsculas, números y guiones"
                  value={organizationSlug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setOrganizationSlug(event.target.value);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Tu nombre</Label>
              <Input
                id="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
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
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Al menos 12 caracteres. La API valida y almacena únicamente el hash.
              </p>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo crear la organización</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button className="w-full" type="submit" loading={submitting}>
              Crear organización
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
