# @turnopro/ai-core

Paquete puro de contratos para el asistente de TurnoPro.

## Principios

1. **Sin acceso a datos**: este paquete no importa Prisma ni conoce la base de datos.
2. **Herramientas tipadas**: cada capacidad del agente se registra con esquema Zod, permisos y contexto de tenant.
3. **Aislamiento**: `ToolContext.organizationId` es obligatorio; la capa que implementa la herramienta debe filtrar siempre por ese valor.
4. **Proveedor reemplazable**: `AssistantProvider` desacopla OpenAI (u otro proveedor) del núcleo.

## Flujo previsto

```text
Usuario -> Web/WhatsApp -> API (auth + tenant) -> Agente -> ToolRegistry -> Servicio de aplicación -> Prisma
```

El agente nunca recibe un cliente de base de datos. Solo recibe la lista de herramientas permitidas para su rol y ejecuta acciones auditadas a través del registro.

La integración con OpenAI y WhatsApp Business Cloud API se implementará en fases posteriores, detrás de adaptadores de infraestructura.
