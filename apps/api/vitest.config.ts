import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Las pruebas corren sin base de datos: solo se prueban utilidades puras
 * (CSV y previsualización de importaciones).
 *
 * `@boda/shared` se consume como fuente TypeScript, así que se resuelve
 * explícitamente al archivo fuente del workspace para que `vitest run`
 * funcione incluso antes de que se genere el enlace de node_modules.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@boda/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    reporters: 'default',
  },
});
