import { WeddingConfigSchema } from '@boda/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { toWeddingDto } from '../services/dto.js';
import { logEvent } from '../services/events.js';
import {
  mergeWeddingConfig,
  parseWeddingConfig,
  serializeWeddingConfig,
} from '../services/wedding-config.js';
import { requireOwnedWedding, weddingCounts, weddingDtoWithCounts } from '../services/weddings.js';
import { IdParamsSchema, SlugSchema, sendError, slugify } from './helpers.js';

/**
 * ---------------------------------------------------------------------------
 * Bodas (panel privado).
 * ---------------------------------------------------------------------------
 * Cada boda tiene un slug público (`/i/<slug>`), un título interno y toda la
 * configuración de la invitación en un solo JSON validado por Zod.
 */

/** La configuración se puede mandar completa o por partes. */
const PartialConfigSchema = WeddingConfigSchema.partial();

const CreateWeddingSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio').max(200),
  slug: SlugSchema.optional(),
  published: z.boolean().optional(),
  config: PartialConfigSchema.optional(),
});

const UpdateWeddingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: SlugSchema.optional(),
  published: z.boolean().optional(),
  config: PartialConfigSchema.optional(),
});

const PublishSchema = z.object({ published: z.boolean() });

export default async function weddingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** Listado con los contadores de confirmaciones de cada boda. */
  app.get('/weddings', async (request, reply) => {
    const userId = request.user.sub;

    const weddings = await prisma.wedding.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    const counts = await weddingCounts(weddings.map((wedding) => wedding.id));
    reply.send(weddings.map((wedding) => toWeddingDto(wedding, counts.get(wedding.id) ?? {})));
  });

  app.post('/weddings', async (request, reply) => {
    const userId = request.user.sub;
    const body = CreateWeddingSchema.parse(request.body);

    const slug = body.slug ?? body.config?.slug ?? slugify(body.title);

    const taken = await prisma.wedding.findUnique({ where: { slug }, select: { id: true } });
    if (taken) {
      sendError(
        reply,
        409,
        'Slug en uso',
        `Ya existe una boda publicada en /i/${slug}. Elegí otra dirección.`,
      );
      return;
    }

    // La configuración completa se arma acá: Zod aplica todos los valores por
    // defecto (tema, secciones, RSVP, etc.).
    const config = WeddingConfigSchema.parse({
      ...(body.config ?? {}),
      slug,
      published: body.published ?? body.config?.published ?? false,
    });

    const wedding = await prisma.wedding.create({
      data: {
        slug,
        title: body.title,
        config: serializeWeddingConfig(config),
        published: config.published,
        ownerId: userId,
      },
    });

    await logEvent({
      weddingId: wedding.id,
      type: 'wedding.created',
      message: `Boda "${wedding.title}" creada (${wedding.slug})`,
      payload: { slug: wedding.slug },
    });

    reply.code(201).send(toWeddingDto(wedding));
  });

  app.get('/weddings/:id', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    reply.send(await weddingDtoWithCounts(wedding));
  });

  app.patch('/weddings/:id', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const body = UpdateWeddingSchema.parse(request.body);
    const slug = body.slug ?? wedding.slug;

    if (slug !== wedding.slug) {
      const taken = await prisma.wedding.findUnique({ where: { slug }, select: { id: true } });
      if (taken && taken.id !== wedding.id) {
        sendError(reply, 409, 'Slug en uso', `Ya existe otra boda en /i/${slug}.`);
        return;
      }
    }

    const current = parseWeddingConfig(wedding.config, wedding.slug);
    const config = mergeWeddingConfig(current, body.config, slug);
    // El estado de publicación vive en la fila y en el JSON: se mantienen sincronizados.
    config.published = body.published ?? config.published;

    const updated = await prisma.wedding.update({
      where: { id: wedding.id },
      data: {
        title: body.title ?? wedding.title,
        slug,
        config: serializeWeddingConfig(config),
        published: config.published,
      },
    });

    await logEvent({
      weddingId: updated.id,
      type: 'wedding.updated',
      message: `Boda "${updated.title}" actualizada`,
      payload: { slug: updated.slug },
    });

    reply.send(await weddingDtoWithCounts(updated));
  });

  app.delete('/weddings/:id', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    await logEvent({
      weddingId: wedding.id,
      type: 'wedding.deleted',
      message: `Boda "${wedding.title}" eliminada junto con sus invitados y campañas`,
      payload: { slug: wedding.slug },
    });

    // Las relaciones están en cascada: invitados, campañas y sesiones se van solos.
    await prisma.wedding.delete({ where: { id: wedding.id } });

    reply.send({ ok: true, id: wedding.id });
  });

  app.post('/weddings/:id/publish', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const body = PublishSchema.parse(request.body);
    const config = parseWeddingConfig(wedding.config, wedding.slug);
    config.published = body.published;

    const updated = await prisma.wedding.update({
      where: { id: wedding.id },
      data: { published: body.published, config: serializeWeddingConfig(config) },
    });

    await logEvent({
      weddingId: updated.id,
      type: 'wedding.published',
      message: body.published
        ? `Invitación publicada en /i/${updated.slug}`
        : `Invitación despublicada (/i/${updated.slug})`,
      payload: { published: body.published },
    });

    reply.send(toWeddingDto(updated));
  });
}
