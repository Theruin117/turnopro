import { RequireAuth } from '@/components/require-auth';

import { AgendaView } from './agenda-view';

export const metadata = { title: 'Agenda' };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const params = await searchParams;

  return (
    <RequireAuth>
      <AgendaView initialClientId={params.clientId} />
    </RequireAuth>
  );
}
