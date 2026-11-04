import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@turnopro/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
