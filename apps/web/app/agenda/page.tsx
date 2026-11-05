import { RequireAuth } from '@/components/require-auth';

import { AgendaView } from './agenda-view';

export const metadata = { title: 'Agenda' };

export default function AgendaPage() {
  return (
    <RequireAuth>
      <AgendaView />
    </RequireAuth>
  );
}
