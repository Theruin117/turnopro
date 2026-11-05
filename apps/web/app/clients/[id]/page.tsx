import { RequireAuth } from '@/components/require-auth';

import { ClientDetailView } from './client-detail-view';

export const metadata = { title: 'Cliente' };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequireAuth>
      <ClientDetailView clientId={id} />
    </RequireAuth>
  );
}
