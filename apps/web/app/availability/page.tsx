import { RequireAuth } from '@/components/require-auth';

import { AvailabilityView } from './availability-view';

export const metadata = { title: 'Disponibilidad' };

export default function AvailabilityPage() {
  return (
    <RequireAuth>
      <AvailabilityView />
    </RequireAuth>
  );
}
