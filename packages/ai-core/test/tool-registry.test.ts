import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AI_ERROR_CODES, AiCoreError, ToolRegistry } from '../src/tool-registry';

const context = {
  organizationId: 'org-1',
  actorUserId: 'user-1',
  role: 'MANAGER' as const,
};

const registry = new ToolRegistry();
registry.register({
  name: 'list_services',
  description: 'Lista servicios de la organización',
  inputSchema: z.object({ query: z.string().optional() }),
  requiredPermissions: ['services:read'],
  execute: vi.fn(async (ctx: { organizationId: string }) => [{ org: ctx.organizationId }]),
});

describe('ToolRegistry', () => {
  it('ejecuta una herramienta autorizada con contexto de tenant', async () => {
    const result = await registry.execute('list_services', context, { query: 'corte' });
    expect(result).toEqual([{ org: 'org-1' }]);
  });

  it('rechaza herramientas para las que el rol no tiene permiso', async () => {
    registry.register({
      name: 'delete_org',
      description: 'Elimina la organización',
      inputSchema: z.object({}),
      requiredPermissions: ['organization:delete'],
      execute: async () => true,
    });

    await expect(registry.execute('delete_org', context, {})).rejects.toMatchObject({
      code: AI_ERROR_CODES.TOOL_FORBIDDEN,
    });
  });

  it('valida la entrada con Zod antes de ejecutar', async () => {
    await expect(registry.execute('list_services', context, { query: 42 })).rejects.toMatchObject({
      code: AI_ERROR_CODES.TOOL_INPUT_INVALID,
    });
  });

  it('exige contexto de organización', async () => {
    await expect(
      registry.execute('list_services', { ...context, organizationId: '' }, {}),
    ).rejects.toBeInstanceOf(AiCoreError);
  });

  it('lista solo herramientas disponibles para el rol', () => {
    expect(registry.listForRole('STAFF').map((tool) => tool.name)).toContain('list_services');
    expect(registry.listForRole('STAFF').map((tool) => tool.name)).not.toContain('delete_org');
  });
});
