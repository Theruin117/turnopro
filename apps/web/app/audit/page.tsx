import { RequireAuth } from '@/components/require-auth';

import { AuditView } from './audit-view';

export const metadata = { title: 'Auditoría' };

export default function AuditPage() {
  return (
    <RequireAuth>
      <AuditView />
    </RequireAuth>
  );
}
