import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, hasPermission, isRole, permissionsForRole } from '../src/rbac';

describe('RBAC', () => {
  it('define únicamente roles conocidos', () => {
    expect(ROLES).toEqual(['OWNER', 'ADMIN', 'MANAGER', 'STAFF']);
    expect(isRole('OWNER')).toBe(true);
    expect(isRole('SUPERADMIN')).toBe(false);
    expect(isRole(null)).toBe(false);
  });

  it('otorga todos los permisos al OWNER', () => {
    expect(permissionsForRole('OWNER')).toEqual([...PERMISSIONS]);
  });

  it('no permite que un STAFF modifique servicios ni la organización', () => {
    expect(hasPermission('STAFF', 'services:read')).toBe(true);
    expect(hasPermission('STAFF', 'services:write')).toBe(false);
    expect(hasPermission('STAFF', 'organization:update')).toBe(false);
  });

  it('reserva la eliminación de la organización y facturación al OWNER', () => {
    expect(hasPermission('ADMIN', 'organization:delete')).toBe(false);
    expect(hasPermission('ADMIN', 'billing:manage')).toBe(false);
    expect(hasPermission('OWNER', 'organization:delete')).toBe(true);
    expect(hasPermission('OWNER', 'billing:manage')).toBe(true);
  });

  it('falla cerrado ante roles inválidos', () => {
    expect(hasPermission('HACKER', 'organization:read')).toBe(false);
    expect(hasPermission(undefined, 'organization:read')).toBe(false);
  });
});
