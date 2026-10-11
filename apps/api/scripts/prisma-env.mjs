/**
 * ---------------------------------------------------------------------------
 * Ejecuta el CLI de Prisma cargando antes el `.env` de la raíz del monorepo.
 * ---------------------------------------------------------------------------
 * El CLI de Prisma solo busca `.env` en su propio directorio (`apps/api` y
 * `apps/api/prisma`), así que el único `.env` del proyecto —el de la raíz— no se
 * veía y `prisma db push` fallaba con "Environment variable not found:
 * DATABASE_URL".
 *
 * Uso (desde apps/api):  node scripts/prisma-env.mjs db push
 *                        node scripts/prisma-env.mjs studio
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

for (const file of [resolve(here, '../../../.env'), resolve(here, '../.env')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    const key = match?.[1];
    const rawValue = match?.[2];
    if (key === undefined || rawValue === undefined) continue;
    // Lo que ya viene del entorno real (Docker, Railway, CI) tiene prioridad.
    if (process.env[key] === undefined) {
      process.env[key] = rawValue.trim().replace(/^(["'])(.*)\1$/, '$2');
    }
  }
}

// Se ejecuta el CLI de Prisma con el propio Node del proyecto, apuntando a su
// entrada JavaScript. Así no depende del PATH ni de un shell intermedio: con
// `shell: true` los argumentos se concatenan (aviso DEP0190 de Node) y en
// Windows el comando puede terminar mal armado.
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));

const child = spawn(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  console.error('No se pudo ejecutar el CLI de Prisma:', error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
