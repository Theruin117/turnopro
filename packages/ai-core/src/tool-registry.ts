import { hasAnyPermission, type Permission, type Role } from '@turnopro/shared';
import { z } from 'zod';

export const AI_ERROR_CODES = {
  TOOL_NOT_FOUND: 'AI_TOOL_NOT_FOUND',
  TOOL_FORBIDDEN: 'AI_TOOL_FORBIDDEN',
  TOOL_INPUT_INVALID: 'AI_TOOL_INPUT_INVALID',
  TOOL_EXECUTION_FAILED: 'AI_TOOL_EXECUTION_FAILED',
  CONTEXT_INVALID: 'AI_CONTEXT_INVALID',
} as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];

export class AiCoreError extends Error {
  override readonly name = 'AiCoreError';

  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, AiCoreError.prototype);
  }
}

/**
 * Contexto obligatorio de toda herramienta.
 * El LLM nunca recibe IDs internos ni acceso a Prisma; solo puede invocar
 * herramientas registradas que operen con este contexto.
 */
export interface ToolContext {
  organizationId: string;
  actorUserId: string;
  role: Role;
  requestId?: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  requiredPermissions: readonly Permission[];
  execute: (context: ToolContext, input: TInput) => Promise<TOutput>;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  requiredPermissions: readonly Permission[];
}

function assertToolContext(context: ToolContext): void {
  if (!context.organizationId || !context.actorUserId) {
    throw new AiCoreError(
      AI_ERROR_CODES.CONTEXT_INVALID,
      'La herramienta requiere organización y actor autenticados.',
    );
  }
}

/**
 * Registro central de herramientas del asistente.
 * No importa Prisma ni clientes de integraciones: la ejecución real se inyecta
 * desde la capa de aplicación (API), que aplica aislamiento y autorización.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  register<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(definition.name)) {
      throw new AiCoreError(
        AI_ERROR_CODES.TOOL_EXECUTION_FAILED,
        `La herramienta "${definition.name}" ya está registrada.`,
      );
    }
    this.tools.set(
      definition.name,
      definition as unknown as ToolDefinition<unknown, unknown>,
    );
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  listForRole(role: Role): ToolDescriptor[] {
    return [...this.tools.values()]
      .filter((tool) => hasAnyPermission(role, tool.requiredPermissions))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        requiredPermissions: tool.requiredPermissions,
      }));
  }

  async execute<TOutput = unknown>(
    name: string,
    context: ToolContext,
    rawInput: unknown,
  ): Promise<TOutput> {
    assertToolContext(context);

    const tool = this.tools.get(name);
    if (!tool) {
      throw new AiCoreError(AI_ERROR_CODES.TOOL_NOT_FOUND, `Herramienta "${name}" no disponible.`);
    }

    if (!hasAnyPermission(context.role, tool.requiredPermissions)) {
      throw new AiCoreError(
        AI_ERROR_CODES.TOOL_FORBIDDEN,
        'El usuario no tiene permisos para ejecutar esta herramienta.',
      );
    }

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AiCoreError(
        AI_ERROR_CODES.TOOL_INPUT_INVALID,
        'Los parámetros de la herramienta no son válidos.',
        z.flattenError(parsed.error),
      );
    }

    return (await tool.execute(context, parsed.data)) as TOutput;
  }
}
