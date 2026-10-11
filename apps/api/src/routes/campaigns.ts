import { CampaignItemStatusSchema, CreateCampaignSchema, renderTemplate } from '@boda/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { prisma } from '../prisma.js';
import {
  buildTemplateContext,
  cancelCampaign,
  pauseCampaign,
  resumeCampaign,
  startCampaign,
} from '../services/campaigns/sender.js';
import { toCampaignDto, toCampaignItemDto } from '../services/dto.js';
import { logEvent } from '../services/events.js';
import { parseWeddingConfig } from '../services/wedding-config.js';
import { requireOwnedCampaign, requireOwnedWedding } from '../services/weddings.js';
import { IdParamsSchema, sendError } from './helpers.js';

/**
 * ---------------------------------------------------------------------------
 * Campañas de envío masivo.
 * ---------------------------------------------------------------------------
 * Crear una campaña congela la lista de destinatarios en `CampaignItem`: a
 * partir de ahí el envío se puede pausar, reanudar o cancelar sin perder el
 * estado de cada mensaje.
 */

const CampaignIdParamsSchema = z.object({ id: z.string().min(1).max(64) });

const CampaignItemsQuerySchema = z.object({
  status: CampaignItemStatusSchema.optional(),
});

export default async function campaignRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/weddings/:id/campaigns', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const campaigns = await prisma.campaign.findMany({
      where: { weddingId: wedding.id },
      orderBy: { createdAt: 'desc' },
    });

    reply.send(campaigns.map((campaign) => toCampaignDto(campaign)));
  });

  /**
   * Crea la campaña con sus destinatarios y arranca el envío.
   * Si no se envían `guestIds`, se toma a todos los invitados con RSVP pendiente.
   */
  app.post('/weddings/:id/campaigns', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const body = CreateCampaignSchema.parse(request.body);
    const config = parseWeddingConfig(wedding.config, wedding.slug);

    const guests = body.guestIds?.length
      ? await prisma.guest.findMany({
          where: { weddingId: wedding.id, id: { in: body.guestIds } },
          orderBy: { fullName: 'asc' },
        })
      : await prisma.guest.findMany({
          where: { weddingId: wedding.id, status: 'pending' },
          orderBy: { fullName: 'asc' },
        });

    if (guests.length === 0) {
      sendError(
        reply,
        400,
        'Sin destinatarios',
        'No hay invitados para enviar. Revisá la lista o los filtros elegidos.',
      );
      return;
    }

    const minDelayMs = body.minDelayMs ?? env.SEND_MIN_DELAY_MS;
    const maxDelayMs = Math.max(body.maxDelayMs ?? env.SEND_MAX_DELAY_MS, minDelayMs);

    const campaign = await prisma.campaign.create({
      data: {
        weddingId: wedding.id,
        name: body.name,
        template: body.template,
        dryRun: body.dryRun,
        minDelayMs,
        maxDelayMs,
        status: 'draft',
        totalCount: guests.length,
      },
    });

    // El texto de cada mensaje se renderiza desde ya: la previsualización del
    // panel muestra exactamente lo que se va a enviar.
    await prisma.campaignItem.createMany({
      data: guests.map((guest) => ({
        campaignId: campaign.id,
        guestId: guest.id,
        status: 'pending',
        renderedBody: renderTemplate(
          campaign.template,
          buildTemplateContext(guest, wedding, config),
        ).body,
      })),
    });

    await logEvent({
      weddingId: wedding.id,
      type: 'campaign.created',
      message: `Campaña "${campaign.name}" creada para ${guests.length} invitados (${body.dryRun ? 'modo seco' : 'envío real'})`,
      payload: { campaignId: campaign.id, dryRun: body.dryRun, total: guests.length },
    });

    // El envío corre en segundo plano; la ruta responde de inmediato.
    await startCampaign(campaign.id);

    const created = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    reply.code(201).send(toCampaignDto(created));
  });

  app.get('/campaigns/:id', async (request, reply) => {
    const { id } = CampaignIdParamsSchema.parse(request.params);
    const campaign = await requireOwnedCampaign(request.user.sub, id, reply);
    if (!campaign) return;

    const fresh = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    reply.send(toCampaignDto(fresh));
  });

  app.post('/campaigns/:id/pause', async (request, reply) => {
    const { id } = CampaignIdParamsSchema.parse(request.params);
    const campaign = await requireOwnedCampaign(request.user.sub, id, reply);
    if (!campaign) return;

    await pauseCampaign(campaign.id);
    const fresh = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    reply.send({ ok: true, campaign: toCampaignDto(fresh) });
  });

  app.post('/campaigns/:id/resume', async (request, reply) => {
    const { id } = CampaignIdParamsSchema.parse(request.params);
    const campaign = await requireOwnedCampaign(request.user.sub, id, reply);
    if (!campaign) return;

    try {
      await resumeCampaign(campaign.id);
    } catch (error) {
      sendError(
        reply,
        409,
        'No se puede reanudar',
        error instanceof Error ? error.message : 'La campaña no se puede reanudar.',
      );
      return;
    }

    const fresh = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    reply.send({ ok: true, campaign: toCampaignDto(fresh) });
  });

  app.post('/campaigns/:id/cancel', async (request, reply) => {
    const { id } = CampaignIdParamsSchema.parse(request.params);
    const campaign = await requireOwnedCampaign(request.user.sub, id, reply);
    if (!campaign) return;

    await cancelCampaign(campaign.id);
    const fresh = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    reply.send({ ok: true, campaign: toCampaignDto(fresh) });
  });

  /** Estado de cada envío, para la pantalla de seguimiento. */
  app.get('/campaigns/:id/items', async (request, reply) => {
    const { id } = CampaignIdParamsSchema.parse(request.params);
    const campaign = await requireOwnedCampaign(request.user.sub, id, reply);
    if (!campaign) return;

    const query = CampaignItemsQuerySchema.parse(request.query);

    const items = await prisma.campaignItem.findMany({
      where: { campaignId: campaign.id, ...(query.status ? { status: query.status } : {}) },
      include: { guest: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });

    reply.send(items.map((item) => toCampaignItemDto(item, item.guest)));
  });
}
