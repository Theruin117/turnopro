import { RequireAuth } from '@/components/require-auth';

import { DashboardView } from './dashboard-view';

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardView />
    </RequireAuth>
  );
}
