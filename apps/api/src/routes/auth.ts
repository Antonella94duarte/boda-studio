/**
 * Las rutas de autenticación viven en `src/auth.ts`, junto con el preHandler
 * `authenticate` y el tipado del token. Este archivo solo las expone para que
 * `src/server.ts` registre todos los plugins de la misma manera.
 */
export { default } from '../auth.js';
