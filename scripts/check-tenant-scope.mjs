#!/usr/bin/env node
/**
 * Guard de aislamiento multi-tenant.
 *
 * Busca llamadas `this.prisma.<modelo>.<operación>(...)` en los servicios de la
 * API y exige que el argumento mencione `organizationId`. Las excepciones
 * justificadas se marcan con un comentario:
 *
 *   // tenant-scope-exempt: se consulta por id después de verificar el tenant
 *
 * Modelos globales (usuarios, refresh tokens y la propia organización) se
 * omiten porque no pertenecen a un tenant concreto o se resuelven antes de
 * establecer el contexto.
 *
 * Este guard es una red de seguridad estática: no sustituye a las pruebas e2e
 * de acceso cruzado ni a una futura RLS de PostgreSQL.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_SRC = join(ROOT, 'apps/api/src');
const TARGET = process.argv[2] ? resolve(process.argv[2]) : API_SRC;

const TENANT_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
  'create',
  'createMany',
]);

/** Modelos sin tenant propio o resueltos antes de tener organización. */
const GLOBAL_MODELS = new Set([
  'organization',
  'user',
  'refreshToken',
  'refreshTokenFamily',
]);

const EXEMPTION = /\btenant-scope-exempt:\s*\S{2,}/;

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield path;
    }
  }
}

/**
 * Devuelve el texto entre paréntesis que empieza en `openIndex`, respetando
 * cadenas, plantillas y comentarios.
 */
function extractArguments(text, openIndex) {
  const balanced = extractBalanced(text, openIndex, '(', ')');
  return balanced.startsWith('(') ? balanced.slice(1) : balanced;
}

/** Devuelve la expresión hasta el `;` de cierre, respetando anidamiento. */
function extractExpression(text, startIndex) {
  let depth = 0;
  let quote = null;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quote) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      const newline = text.indexOf('\n', index);
      if (newline === -1) return text.slice(startIndex);
      index = newline;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{' || char === '(' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ')' || char === ']') {
      depth -= 1;
    } else if (char === ';' && depth === 0) {
      return text.slice(startIndex, index);
    }
  }

  return text.slice(startIndex);
}

function extractBalanced(text, startIndex, open, close) {
  let depth = 0;
  let quote = null;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quote) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      const newline = text.indexOf('\n', index);
      if (newline === -1) return text.slice(startIndex);
      index = newline;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index);
      }
    }
  }

  return text.slice(startIndex);
}

/**
 * `true` si la llamada menciona `organizationId` de forma directa o mediante
 * una variable local (`const where = { organizationId, ... }`).
 */
function referencesTenant(text, args, callIndex) {
  if (/\borganizationId\b/.test(args) || /\btenantId\b/.test(args)) {
    return true;
  }

  const identifiers = new Set(args.match(/\b[A-Za-z_$][\w$]*\b/g) ?? []);
  // Limita la búsqueda de variables al método actual: un `where` de otra
  // función no debe justificar esta consulta.
  const boundary = text.lastIndexOf('\n  }\n', callIndex);
  const scopeStart = boundary === -1 ? 0 : boundary + '\n  }\n'.length;
  const scopeText = text.slice(scopeStart, callIndex);

  for (const identifier of identifiers) {
    if (identifier.length < 2) continue;

    const definition = new RegExp(
      `(?:const|let|var)\\s+${identifier}\\s*(?::[^=]+)?=\\s*`,
      'g',
    );

    for (const match of scopeText.matchAll(definition)) {
      const expression = extractExpression(
        text,
        scopeStart + match.index + match[0].length,
      );
      if (/\borganizationId\b|\btenantId\b/.test(expression)) {
        return true;
      }
    }
  }

  return false;
}

const violations = [];
let exemptions = 0;
let checkedCalls = 0;

for (const file of walk(TARGET)) {
  if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) continue;

  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const pattern = /this\.prisma\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*\(/g;

  for (const match of text.matchAll(pattern)) {
    const [, model, operation] = match;
    if (!TENANT_OPERATIONS.has(operation)) continue;
    if (GLOBAL_MODELS.has(model)) continue;

    checkedCalls += 1;

    const openIndex = match.index + match[0].length - 1;
    const args = extractArguments(text, openIndex);
    if (referencesTenant(text, args, match.index)) {
      continue;
    }

    const line = text.slice(0, match.index).split('\n').length;
    const context = lines
      .slice(Math.max(0, line - 5), line)
      .join('\n');

    if (EXEMPTION.test(context)) {
      exemptions += 1;
      continue;
    }

    violations.push({
      file: relative(ROOT, file),
      line,
      model,
      operation,
    });
  }
}

if (violations.length > 0) {
  console.error('Consultas Prisma sin organizationId:');
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line}  this.prisma.${violation.model}.${violation.operation}`,
    );
  }
  console.error(
    '\nFiltra por organizationId o documenta la excepción con ' +
      '`// tenant-scope-exempt: <motivo>`.',
  );
  process.exit(1);
}

console.log(
  `Aislamiento verificado: ${checkedCalls} consultas con tenant, ` +
    `${exemptions} excepciones justificadas.`,
);
