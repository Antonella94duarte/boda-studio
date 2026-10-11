import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import { authenticate } from './auth.js';
import { env } from './env.js';
import { prisma } from './prisma.js';
import authRoutes from './routes/auth.js';
import campaignRoutes from './routes/campaigns.js';
import guestRoutes from './routes/guests.js';
import importRoutes from './routes/imports.js';
import publicRoutes from './routes/public.js';
import weddingRoutes from './routes/weddings.js';
import whatsappRoutes from './routes/whatsapp.js';

/**
 * ---------------------------------------------------------------------------
 * Servidor HTTP.
 * ---------------------------------------------------------------------------
 * `createApp()` se exporta aparte de `start()` para poder levantar la API en
 * pruebas (con `app.inject`) sin abrir un puerto.
 */

/** Límite de subida de archivos de invitados: 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isTest ? false : { level: env.isProduction ? 'info' : 'debug' },
    trustProxy: true,
    // Los JSON de importación pueden traer miles de filas.
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.PUBLIC_WEB_URL,
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '30d' },
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 20 },
  });

  // Se decora en la instancia raíz para que todos los plugins lo hereden.
  app.decorate('authenticate', authenticate);

  app.get('/api/health', async () => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }

    return {
      status: 'ok',
      env: env.NODE_ENV,
      database,
      whatsappEngine: env.WHATSAPP_ENGINE,
      uptime: Math.round(process.uptime()),
      publicWebUrl: env.PUBLIC_WEB_URL,
    };
  });

  // Todas las rutas viven bajo /api (los plugins declaran rutas relativas).
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(weddingRoutes);
      await api.register(guestRoutes);
      await api.register(importRoutes);
      await api.register(campaignRoutes);
      await api.register(whatsappRoutes);
      await api.register(publicRoutes);
    },
    { prefix: '/api' },
  );

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: 'Ruta no encontrada',
      message: `${request.method} ${request.url} no existe en esta API.`,
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Todos los cuerpos se validan con Zod: el detalle se devuelve al panel.
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: 'Datos inválidos',
        message: 'Revisá los campos enviados.',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;

    if (statusCode >= 500) {
      // Nunca se filtra el stack trace ni el mensaje interno en producción.
      request.log.error(error);
      reply.code(statusCode).send({
        error: 'Error interno',
        message: env.isProduction
          ? 'Ocurrió un error inesperado. Volvé a intentar en unos minutos.'
          : error.message,
      });
      return;
    }

    reply.code(statusCode).send({
      error: error.name || 'Error',
      message: error.message,
    });
  });

  return app;
}

/** Levanta la API y cierra ordenadamente ante SIGINT/SIGTERM. */
export async function start(): Promise<void> {
  const app = await createApp();
  let closing = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info(`Señal ${signal} recibida: cerrando la API…`);
    try {
      await app.close();
    } catch (error) {
      console.error('Error al cerrar el servidor HTTP', error);
    }
    try {
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error al desconectar Prisma', error);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(
    `Boda Studio API lista en ${env.PUBLIC_API_URL} (puerto ${env.PORT}, motor de WhatsApp: ${env.WHATSAPP_ENGINE})`,
  );
}

// Solo arranca si se ejecuta directamente (`node dist/server.js` o `tsx src/server.ts`).
const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  start().catch(async (error: unknown) => {
    console.error('No se pudo iniciar la API:', error);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
}
