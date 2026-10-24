import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuración de Vite para @boda/web.
 *
 * `@boda/shared` es un paquete del workspace que compila a `dist` (lo consumen
 * también la API y, por lo tanto, `tsc`). Acá se aliasa a su `src` para que el
 * servidor de desarrollo tome los cambios del paquete compartido sin recompilar,
 * y se excluye del pre-bundling para que Vite lo transforme él mismo.
 *
 * Ojo con la ruta: en Windows `new URL(...).pathname` devuelve "/C:/...", que no
 * es una ruta de archivo válida; hay que usar `fileURLToPath`.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      /**
       * Los editores que guardan de forma atómica (crean un archivo temporal y
       * después lo renombran) dejan carpetas `.*.tmpdir` y `.tmp` dentro de
       * `src`. En Windows, Vite intenta observarlas y el proceso muere con
       * `EBUSY: resource busy or locked`, tumbando también la API cuando corre
       * con `pnpm dev`. Ignorarlas evita ese crash sin perder el hot reload.
       */
      ignored: ['**/node_modules/**', '**/.git/**', '**/.*.tmpdir/**', '**/*.tmp'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@boda/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@boda/shared'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
