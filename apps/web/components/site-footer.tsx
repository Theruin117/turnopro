import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>TurnoPro · Fundación SaaS multi-tenant</p>
        <p>
          API documentada en{' '}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            href="http://localhost:3001/docs"
            target="_blank"
            rel="noreferrer"
          >
            /docs
          </Link>
          . Datos de demostración ficticios.
        </p>
      </div>
    </footer>
  );
}
