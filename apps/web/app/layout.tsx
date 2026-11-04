import type { Metadata } from 'next';

import { AuthProvider } from '@/components/providers/auth-provider';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TurnoPro — Gestión de turnos para equipos',
    template: '%s · TurnoPro',
  },
  description:
    'Base SaaS multi-tenant para gestionar servicios, equipo y agenda con aislamiento por organización.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col">
        <AuthProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
