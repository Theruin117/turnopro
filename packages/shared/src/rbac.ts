export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PERMISSIONS = [
  'organization:read',
  'organization:update',
  'organization:delete',
  'members:read',
  'members:invite',
  'members:update',
  'members:remove',
  'services:read',
  'services:write',
  'employees:read',
  'employees:write',
  'clients:read',
  'clients:write',
  'appointments:read',
  'appointments:write',
  'reports:read',
  'audit:read',
  'billing:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: [
    'organization:read',
    'organization:update',
    'members:read',
    'members:invite',
    'members:update',
    'members:remove',
    'services:read',
    'services:write',
    'employees:read',
    'employees:write',
    'clients:read',
    'clients:write',
    'appointments:read',
    'appointments:write',
    'reports:read',
    'audit:read',
  ],
  MANAGER: [
    'organization:read',
    'members:read',
    'services:read',
    'services:write',
    'employees:read',
    'employees:write',
    'clients:read',
    'clients:write',
    'appointments:read',
    'appointments:write',
    'reports:read',
  ],
  STAFF: [
    'organization:read',
    'services:read',
    'employees:read',
    'clients:read',
    'appointments:read',
    'appointments:write',
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function permissionsForRole(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: Role | string | null | undefined, permission: Permission): boolean {
  if (!isRole(role)) {
    return false;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(
  role: Role | string | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}
