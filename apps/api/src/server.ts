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
import systemRoutes from './routes/system.js';
import uploadRoutes, { publicImageRoutes } from './routes/uploads.js';
import weddingRoutes from './routes/weddings.js';
import whatsappRoutes from './routes/whatsapp.js';
import { currentLinkHealth, linkWarningLine } from './services/link-health.js';

/**
 * ---------------------------------------------------------------------------
 * Servidor HTTP.
 * ---------------------------------------------------------------------------
 * `createApp()` se exporta aparte de `start()` para poder levantar la API en
 * pruebas (con `app.inject`) sin abrir un puerto.
 */

/** Límite de subida de archivos de invitados: 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Configuración del logger.
 *
 * En producción se emite JSON (lo que esperan los servicios de logs: Railway,
 * Render, Docker). En desarrollo se lee a mano, así que el JSON crudo de pino
 * (`{"level":30,"time":1792…,"pid":…}`) no aporta nada: `pino-pretty` lo
 * convierte en una línea con hora y mensaje. Si el paquete no estuviera
 * instalado, pino falla al arrancar; por eso es dependencia de desarrollo
 * declarada y solo se usa fuera de producción.
 *
 * En pruebas (`NODE_ENV=test`) no hay logger: los tests no ensucian la salida.
 */
function loggerOptions() {
  if (env.isTest) return false;
  if (env.isProduction) return { level: 'info' as const };

  return {
    level: 'debug' as const,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: true,
        errorLikeObjectKeys: ['err', 'error'],
      },
    },
  };
}

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(),
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
    // `files` tiene que alcanzar para la subida de fotos (hasta 10 por vez).
    // El importador de invitados usa un solo archivo, pero comparte este límite.
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 12, fields: 20 },
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

    const links = currentLinkHealth();

    return {
      status: 'ok',
      env: env.NODE_ENV,
      database,
      whatsappEngine: env.WHATSAPP_ENGINE,
      uptime: Math.round(process.uptime()),
      publicWebUrl: env.PUBLIC_WEB_URL,
      // Se publica acá para que un chequeo externo (o `curl` desde otro sitio)
      // detecte el error clásico: invitaciones que apuntan a localhost.
      linkIsPublic: links.check.isPublic,
      linkSendable: links.sendable,
      linkProblem: links.check.problem,
      linkWarnings: links.check.warnings,
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
      await api.register(uploadRoutes);
      // Sin token: el invitado abre su invitación sin sesión.
      await api.register(publicImageRoutes);
      await api.register(publicRoutes);
      await api.register(systemRoutes);
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

  // Aviso de arranque: es el error de configuración que más caro sale, porque
  // se descubre cuando los invitados ya recibieron un enlace muerto.
  const linkWarning = linkWarningLine();
  if (linkWarning) {
    app.log.warn(linkWarning);
  } else {
    app.log.info(`Enlaces de invitación: ${env.PUBLIC_WEB_URL}`);
  }
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
