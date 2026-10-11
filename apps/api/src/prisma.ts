import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * Cliente Prisma único por proceso.
 *
 * En desarrollo `tsx watch` reinicia el módulo en cada cambio; sin esta guarda
 * se abrirían conexiones nuevas en cada recarga hasta agotar el pool.
 */
const globalForPrisma = globalThis as unknown as { __bodaStudioPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__bodaStudioPrisma ??
  new PrismaClient({
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (!env.isProduction) {
  globalForPrisma.__bodaStudioPrisma = prisma;
}

export default prisma;
