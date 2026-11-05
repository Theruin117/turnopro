import { RequireAuth } from '@/components/require-auth';

import { CatalogView } from './catalog-view';

export const metadata = { title: 'Catálogo' };

export default function CatalogPage() {
  return (
    <RequireAuth>
      <CatalogView />
    </RequireAuth>
  );
}
