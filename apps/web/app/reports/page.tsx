import { RequireAuth } from '@/components/require-auth';

import { ReportsView } from './reports-view';

export const metadata = { title: 'Reportes' };

export default function ReportsPage() {
  return (
    <RequireAuth>
      <ReportsView />
    </RequireAuth>
  );
}
