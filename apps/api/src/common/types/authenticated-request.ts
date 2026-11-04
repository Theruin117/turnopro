import type { Membership, Organization } from '@turnopro/database';
import type { Role } from '@turnopro/shared';
import type { Request } from 'express';

export interface AccessTokenPayload {
  sub: string;
  org: string;
  mid: string;
  role: Role;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export type SessionMembership = Membership & { user?: SessionUser };

export interface AuthenticatedRequest extends Request {
  auth: AccessTokenPayload;
  user: SessionUser;
  membership: SessionMembership;
  organization: Organization;
}
