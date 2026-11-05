/**
 * Entrada de Vercel Functions para la API NestJS.
 *
 * Vercel ejecuta este módulo como una función Node y le pasa `req`/`res`
 * nativos. La aplicación Nest compilada conserva los metadatos de decoradores
 * porque se genera con `nest build` (tsc), no con un bundler que los elimine.
 */
const handler = require('../apps/api/dist/serverless').default;

module.exports = handler;
