/**
 * Puerto del proveedor de IA. La implementación concreta (OpenAI, etc.)
 * vivirá en un adaptador de infraestructura y solo podrá actuar a través
 * de herramientas autorizadas, nunca contra la base de datos.
 */
export interface AssistantMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

export interface AssistantRequest {
  organizationId: string;
  actorUserId: string;
  messages: AssistantMessage[];
  availableTools: string[];
}

export interface AssistantResponse {
  message: AssistantMessage;
  toolCalls: Array<{ name: string; arguments: unknown }>;
}

export interface AssistantProvider {
  readonly name: string;
  complete(request: AssistantRequest): Promise<AssistantResponse>;
}
