import { DEFAULT_TEMPLATE, normalizePhone, renderTemplate } from '@boda/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { buildTemplateContext } from '../services/campaigns/sender.js';
import { logEvent } from '../services/events.js';
import { parseWeddingConfig } from '../services/wedding-config.js';
import { requireOwnedWedding } from '../services/weddings.js';
import { getEngine } from '../whatsapp/index.js';
import { loadSession, saveSession } from '../whatsapp/session-store.js';
import { IdParamsSchema, sendError } from './helpers.js';

/**
 * ---------------------------------------------------------------------------
 * WhatsApp: estado de la sesión, QR, conexión y envío de prueba.
 * ---------------------------------------------------------------------------
 * El panel consulta `GET /api/whatsapp/status` y, si el motor es Baileys,
 * muestra el QR de `GET /api/whatsapp/qr` para escanear una sola vez.
 *
 * `POST /weddings/:id/whatsapp/test` manda UN mensaje a un número cualquiera
 * (normalmente el de la propia organizadora) sin tocar la lista de invitados:
 * es la forma segura de comprobar que el número quedó bien conectado y que el
 * texto se ve como se espera antes de lanzar una campaña.
 */

/** Cuerpo del envío de prueba. */
const TestSendSchema = z.object({
  phone: z.string().min(6, 'Escribí un número de WhatsApp'),
  /** Plantilla a probar; si falta, se usa la de por defecto. */
  template: z.string().max(4000).optional(),
  guestName: z.string().max(120).optional(),
  passes: z.number().int().min(1).max(20).optional(),
  defaultCountry: z.string().length(2).optional(),
});

export default async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/whatsapp/status', async (request, reply) => {
    const userId = request.user.sub;
    const engine = getEngine(userId);
    const status = await engine.status();
    // Se guarda para que el estado sobreviva a un reinicio de la API.
    await saveSession(userId, status).catch(() => undefined);

    reply.send({
      engine: engine.id,
      status: status.status,
      phoneNumber: status.phoneNumber ?? null,
      qrDataUrl: status.qrDataUrl ?? null,
      lastError: status.lastError ?? null,
      hasQr: Boolean(status.qrDataUrl),
    });
  });

  app.post('/whatsapp/connect', async (request, reply) => {
    const userId = request.user.sub;
    const engine = getEngine(userId);
    await engine.connect();
    const status = await engine.status();
    await saveSession(userId, status).catch(() => undefined);

    reply.send({
      engine: engine.id,
      status: status.status,
      phoneNumber: status.phoneNumber ?? null,
      qrDataUrl: status.qrDataUrl ?? null,
      lastError: status.lastError ?? null,
      hasQr: Boolean(status.qrDataUrl),
    });
  });

  app.post('/whatsapp/logout', async (request, reply) => {
    const userId = request.user.sub;
    const engine = getEngine(userId);
    await engine.logout();
    const status = await engine.status();
    await saveSession(userId, { ...status, status: 'disconnected', qrDataUrl: undefined });

    reply.send({ engine: engine.id, status: 'disconnected' });
  });

  /** Último QR como data URL (PNG en base64) listo para un <img src>. */
  app.get('/whatsapp/qr', async (request, reply) => {
    const userId = request.user.sub;
    const engine = getEngine(userId);
    const status = await engine.status();
    const stored = await loadSession(userId);

    const qrDataUrl = status.qrDataUrl ?? stored?.qrDataUrl ?? null;

    reply.send({
      engine: engine.id,
      status: status.status,
      qrDataUrl,
      /** Cuándo se generó: el QR de WhatsApp vence en pocos minutos. */
      updatedAt: stored?.lastQrAt?.toISOString() ?? null,
      hint:
        engine.id === 'baileys'
          ? 'Abrí WhatsApp > Dispositivos vinculados > Vincular un dispositivo y escaneá este código.'
          : engine.id === 'cloud-api'
            ? 'La API oficial no usa QR: se configura con WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN.'
            : 'El motor actual es de previsualización: no envía mensajes reales.',
      sessionDir: engine.id === 'baileys' ? env.WHATSAPP_SESSION_DIR : null,
    });
  });

  /**
   * Envía un mensaje de prueba a un número concreto.
   *
   * No crea ni modifica invitados: sirve para verificar la conexión y el texto.
   */
  app.post('/weddings/:id/whatsapp/test', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const body = TestSendSchema.parse(request.body);

    const normalized = normalizePhone(body.phone, {
      defaultCountry: body.defaultCountry ?? 'PY',
    });
    if (!normalized.ok) {
      sendError(reply, 400, 'Teléfono inválido', normalized.reason);
      return;
    }

    const config = parseWeddingConfig(wedding.config, wedding.slug);
    const template = body.template?.trim() ? body.template : DEFAULT_TEMPLATE;

    const context = buildTemplateContext(
      {
        fullName: body.guestName?.trim() || 'Invitado de prueba',
        token: 'prueba',
        passes: body.passes ?? config.rsvp.defaultPasses,
      },
      { slug: wedding.slug },
      config,
    );

    // En una prueba el enlace va sin token, apuntando a la invitación general:
    // un token inventado abriría "enlace inválido" y no se vería nada.
    const enlace = `${env.PUBLIC_WEB_URL}/i/${wedding.slug}`;
    const rendered = renderTemplate(template, { ...context, enlace, rsvp: `${enlace}#rsvp` });

    if (rendered.missing.length > 0) {
      sendError(
        reply,
        400,
        'Faltan datos en la plantilla',
        `La plantilla usa ${rendered.missing.map((v) => `{{${v}}}`).join(', ')} y no hay valor para reemplazarlas.`,
      );
      return;
    }

    const engine = getEngine(request.user.sub);
    const status = await engine.status();
    if (status.status !== 'connected') {
      sendError(
        reply,
        409,
        'WhatsApp no está conectado',
        status.lastError
          ? `No se puede enviar todavía: ${status.lastError}`
          : 'Conectá el número en esta pantalla (escaneando el QR) antes de mandar una prueba.',
      );
      return;
    }

    const result = await engine.sendText(normalized.e164, rendered.body);

    await logEvent({
      weddingId: wedding.id,
      type: 'whatsapp.test',
      message: `Mensaje de prueba a ${normalized.e164} con el motor ${engine.id}`,
      payload: { phone: normalized.e164, engine: engine.id, delivered: engine.id !== 'preview' },
    });

    reply.send({
      ok: true,
      engine: engine.id,
      phone: normalized.e164,
      messageId: result.messageId,
      /** `false` con el motor de previsualización: no salió nada de verdad. */
      delivered: engine.id !== 'preview',
      body: rendered.body,
      note:
        engine.id === 'preview'
          ? 'El motor de previsualización no envía mensajes reales: solo se registró el texto.'
          : undefined,
    });
  });
}
