import { RsvpSubmissionSchema } from '@boda/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { toPublicGuest } from '../services/dto.js';
import { logEvent } from '../services/events.js';
import { parseWeddingConfig } from '../services/wedding-config.js';
import { SlugTokenParamsSchema, sendError } from './helpers.js';

/**
 * ---------------------------------------------------------------------------
 * Rutas públicas (sin autenticación).
 * ---------------------------------------------------------------------------
 * Las consume la invitación web que abre cada invitado. Nunca exponen
 * teléfonos, notas internas ni datos de otros invitados.
 *
 * Además, nada es accesible mientras la boda no esté publicada.
 */

export default async function publicRoutes(app: FastifyInstance): Promise<void> {
  /** Configuración de la invitación para la web pública. */
  app.get('/public/weddings/:slug', async (request, reply) => {
    const { slug } = SlugTokenParamsSchema.pick({ slug: true }).parse(request.params);

    const wedding = await prisma.wedding.findFirst({
      where: { slug, published: true },
      select: { slug: true, config: true },
    });

    if (!wedding) {
      sendError(reply, 404, 'Invitación no encontrada', 'Esta invitación no existe o no está publicada.');
      return;
    }

    reply.send({ slug: wedding.slug, config: parseWeddingConfig(wedding.config, wedding.slug) });
  });

  /** Datos del invitado dueño del enlace personalizado. */
  app.get('/public/weddings/:slug/guest/:token', async (request, reply) => {
    const { slug, token } = SlugTokenParamsSchema.parse(request.params);

    const wedding = await prisma.wedding.findFirst({
      where: { slug, published: true },
      select: { id: true, slug: true },
    });
    if (!wedding) {
      sendError(reply, 404, 'Invitación no encontrada', 'Esta invitación no existe o no está publicada.');
      return;
    }

    const guest = await prisma.guest.findFirst({
      where: { weddingId: wedding.id, token },
    });
    if (!guest) {
      sendError(reply, 404, 'Enlace inválido', 'Este enlace personalizado no es válido.');
      return;
    }

    reply.send(toPublicGuest(guest));
  });

  /** Confirmación de asistencia desde la propia invitación. */
  app.post('/public/weddings/:slug/guest/:token/rsvp', async (request, reply) => {
    const { slug, token } = SlugTokenParamsSchema.parse(request.params);

    const wedding = await prisma.wedding.findFirst({
      where: { slug, published: true },
      select: { id: true, slug: true, config: true },
    });
    if (!wedding) {
      sendError(reply, 404, 'Invitación no encontrada', 'Esta invitación no existe o no está publicada.');
      return;
    }

    const config = parseWeddingConfig(wedding.config, wedding.slug);
    if (!config.rsvp.allowOnlineConfirm) {
      sendError(
        reply,
        403,
        'Confirmación deshabilitada',
        `Por favor confirmá tu asistencia por WhatsApp al ${config.rsvp.contactPhone ?? 'número indicado en la invitación'}.`,
      );
      return;
    }

    const guest = await prisma.guest.findFirst({ where: { weddingId: wedding.id, token } });
    if (!guest) {
      sendError(reply, 404, 'Enlace inválido', 'Este enlace personalizado no es válido.');
      return;
    }

    const body = RsvpSubmissionSchema.parse(request.body);

    const status = body.attending === 'yes' ? 'confirmed' : body.attending === 'no' ? 'declined' : 'maybe';
    const companions = (body.companions ?? []).map((name) => name.trim()).filter((name) => name !== '');

    const updated = await prisma.guest.update({
      where: { id: guest.id },
      data: {
        status,
        companions: JSON.stringify(companions),
        dietary: body.dietary ?? null,
        guestMessage: body.message ?? null,
        respondedAt: new Date(),
      },
    });

    await logEvent({
      weddingId: wedding.id,
      type: 'guest.rsvp',
      message: `${updated.fullName} respondió "${body.attending}" (${status})`,
      payload: {
        guestId: updated.id,
        attending: body.attending,
        companions,
      },
    });

    reply.send(toPublicGuest(updated));
  });
}
