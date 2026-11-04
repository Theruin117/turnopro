'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, buttonVariants, cn } from '@turnopro/ui';

import { useAuth } from '@/components/providers/auth-provider';
import { ApiError } from '@/lib/api';

const appLinks = [
  { href: '/dashboard', label: 'Panel' },
  { href: '/team', label: 'Equipo' },
  { href: '/settings', label: 'Organización' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, status, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout(): Promise<void> {
    setSigningOut(true);
    setError(null);
    try {
      await logout();
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo cerrar la sesión');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            T
          </span>
          TurnoPro
        </Link>

        {session ? (
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {appLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  pathname.startsWith(link.href) && 'bg-accent text-accent-foreground',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {status === 'loading' ? (
            <span className="text-xs text-muted-foreground">Cargando sesión…</span>
          ) : session ? (
            <>
              <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:block">
                {session.organization.name}
              </span>
              <Button variant="outline" size="sm" loading={signingOut} onClick={handleLogout}>
                Cerrar sesión
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Iniciar sesión
              </Link>
              <Link
                href="/register"
                className={buttonVariants({ variant: 'default', size: 'sm' })}
              >
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
      {error ? (
        <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-2 text-center text-xs text-destructive">
          {error}
        </div>
      ) : null}
      {session ? (
        <nav className="flex items-center gap-1 overflow-x-auto border-t px-4 py-2 md:hidden">
          {appLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                pathname.startsWith(link.href) && 'bg-accent text-accent-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
