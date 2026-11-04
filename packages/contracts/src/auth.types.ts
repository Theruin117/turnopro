import type { Permission, Role } from '@turnopro/shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  status: string;
  createdAt: string;
}

export interface AuthMembership {
  id: string;
  role: Role;
  permissions: Permission[];
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
  organization: AuthOrganization;
  membership: AuthMembership;
}

/** Contexto de la sesión actual sin volver a exponer el access token. */
export interface AuthContext {
  user: AuthUser;
  organization: AuthOrganization;
  membership: AuthMembership;
}

export interface MembershipListItem {
  id: string;
  role: Role;
  status: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export const TERMINAL_MEMBERSHIP_STATUSES = ['SUSPENDED'] as const;
