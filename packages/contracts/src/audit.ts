import { z } from 'zod';

export const auditQuerySchema = z.object({
  entity: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditActor {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: AuditActor | null;
}
