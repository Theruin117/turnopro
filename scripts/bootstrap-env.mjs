#!/usr/bin/env node
/**
 * Genera un `.env` local a partir de `.env.example`.
 * - No sobreescribe un `.env` existente.
 * - Reemplaza `__GENERATED_SECRET__` por un secreto criptográfico.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = resolve(root, '.env.example');
const targetPath = resolve(root, '.env');

if (existsSync(targetPath)) {
  console.log('· .env ya existe. No se realizaron cambios.');
  process.exit(0);
}

const secret = randomBytes(48).toString('base64url');
const content = readFileSync(examplePath, 'utf8').replaceAll('__GENERATED_SECRET__', secret);

writeFileSync(targetPath, content, { mode: 0o600 });
console.log('✓ .env local creado con un JWT_ACCESS_SECRET aleatorio.');
console.log('  Revisa DATABASE_URL/REDIS_URL y ejecuta `pnpm db:migrate`.');
