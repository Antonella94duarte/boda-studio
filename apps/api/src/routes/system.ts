import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { currentLinkHealth, exampleGuestLink, linkWarningLine } from '../services/link-health.js';

/**
 * ---------------------------------------------------------------------------
 * Estado del sistema que el panel necesita ver.
 * ---------------------------------------------------------------------------
 * `GET /api/system/links` responde a la pregunta que la organizadora hace
 * cuando algo no funciona: "¿a dónde apuntan los enlaces que estoy mandando?".
 * El panel lo usa para mostrar un aviso cuando la dirección no es pública,
 * antes de que se le ocurra lanzar una campaña real.
 */

export default async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/system/links', async (_request, reply) => {
    const health = currentLinkHealth();

    reply.send({
      publicWebUrl: health.publicWebUrl,
      publicApiUrl: health.publicApiUrl,
      /** ¿La abre un teléfono fuera de esta red? */
      isPublic: health.check.isPublic,
      /** ¿Se puede lanzar un envío real con esta configuración? */
      sendable: health.sendable,
      problem: health.check.problem,
      message: health.check.message,
      warnings: health.check.warnings,
      /** Enlace de ejemplo con la forma del `{{enlace}}` real. */
      exampleLink: exampleGuestLink(),
      remedy: health.remedy,
      docs: health.docs,
      whatsappEngine: env.WHATSAPP_ENGINE,
      warning: linkWarningLine(health),
    });
  });
}
