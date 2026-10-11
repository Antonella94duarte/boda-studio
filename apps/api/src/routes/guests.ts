import { GuestInputSchema, RsvpStatusSchema, normalizePhone } from '@boda/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { toGuestDto, type GuestDto } from '../services/dto.js';
import { logEvent } from '../services/events.js';
import { generateGuestToken, guestLink } from '../services/tokens.js';
import { requireOwnedGuest, requireOwnedWedding } from '../services/weddings.js';
import {
  IdParamsSchema,
  WeddingGuestParamsSchema,
  sendError,
  httpError,
} from './helpers.js';

/**
 * ---------------------------------------------------------------------------
 * Invitados (panel privado).
 * ---------------------------------------------------------------------------
 * El teléfono SIEMPRE se normaliza a E.164 antes de guardar: es el dato con el
 * que se envía el WhatsApp. El original queda en `rawPhone` para auditoría.
 */

const GuestsQuerySchema = z.object({
  status: RsvpStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  group: z.string().trim().max(120).optional(),
});

const UpdateGuestSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().min(6).max(40).optional(),
  passes: z.number().int().min(1).max(20).optional(),
  groupName: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: RsvpStatusSchema.optional(),
  companions: z.array(z.string().min(1)).max(20).optional(),
  dietary: z.string().max(500).nullable().optional(),
  guestMessage: z.string().max(1000).nullable().optional(),
});

async function duplicatePhone(weddingId: string, phone: string, exceptId?: string) {
  return prisma.guest.findFirst({
    where: {
      weddingId,
      phone,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, fullName: true },
  });
}

export default async function guestRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** Listado con filtros: estado de confirmación, texto libre y grupo/familia. */
  app.get('/weddings/:id/guests', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const query = GuestsQuerySchema.parse(request.query);

    const where: Prisma.GuestWhereInput = { weddingId: wedding.id };
    if (query.status) where.status = query.status;
    if (query.group) where.groupName = query.group;
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q } },
        { phone: { contains: query.q } },
        { groupName: { contains: query.q } },
      ];
    }

    const guests = await prisma.guest.findMany({
      where,
      orderBy: [{ groupName: 'asc' }, { fullName: 'asc' }],
    });

    reply.send(guests.map((guest) => toGuestDto(guest)));
  });

  app.post('/weddings/:id/guests', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const body = GuestInputSchema.parse(request.body);

    const normalized = normalizePhone(body.phone, { defaultCountry: 'PY' });
    if (!normalized.ok) {
      sendError(reply, 400, 'Teléfono inválido', normalized.reason);
      return;
    }

    const existing = await duplicatePhone(wedding.id, normalized.e164);
    if (existing) {
      sendError(
        reply,
        409,
        'Teléfono repetido',
        `Ya existe un invitado con ese teléfono: ${existing.fullName}.`,
        { guestId: existing.id },
      );
      return;
    }

    const guest = await prisma.guest.create({
      data: {
        weddingId: wedding.id,
        token: generateGuestToken(),
        fullName: body.fullName,
        rawPhone: body.phone,
        phone: normalized.e164,
        passes: body.passes,
        groupName: body.groupName ?? null,
        notes: body.notes ?? null,
      },
    });

    await logEvent({
      weddingId: wedding.id,
      type: 'guest.created',
      message: `Invitado agregado a mano: ${guest.fullName}`,
      payload: { guestId: guest.id },
    });

    /* El enlace personalizado se devuelve listo para compartir. */
    const dto: GuestDto & { link: string } = {
      ...toGuestDto(guest),
      link: guestLink(wedding.slug, guest.token),
    };

    reply.code(201).send(dto);
  });

  app.patch('/guests/:guestId', async (request, reply) => {
    const { guestId } = z.object({ guestId: z.string().min(1).max(64) }).parse(request.params);
    const guest = await requireOwnedGuest(request.user.sub, guestId, reply);
    if (!guest) return;

    const body = UpdateGuestSchema.parse(request.body);
    const data: Prisma.GuestUpdateInput = {};

    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.passes !== undefined) data.passes = body.passes;
    if (body.groupName !== undefined) data.groupName = body.groupName;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status !== undefined) data.status = body.status;
    if (body.companions !== undefined) data.companions = JSON.stringify(body.companions);
    if (body.dietary !== undefined) data.dietary = body.dietary;
    if (body.guestMessage !== undefined) data.guestMessage = body.guestMessage;

    if (body.phone !== undefined) {
      const normalized = normalizePhone(body.phone, { defaultCountry: 'PY' });
      if (!normalized.ok) {
        sendError(reply, 400, 'Teléfono inválido', normalized.reason);
        return;
      }
      const existing = await duplicatePhone(guest.weddingId, normalized.e164, guest.id);
      if (existing) {
        sendError(
          reply,
          409,
          'Teléfono repetido',
          `Otro invitado de esta boda ya usa ese teléfono: ${existing.fullName}.`,
          { guestId: existing.id },
        );
        return;
      }
      data.phone = normalized.e164;
      data.rawPhone = body.phone;
    }

    if (Object.keys(data).length === 0) {
      throw httpError(400, 'No se envió ningún campo para actualizar');
    }

    const updated = await prisma.guest.update({ where: { id: guest.id }, data });
    reply.send(toGuestDto(updated));
  });

  app.delete('/guests/:guestId', async (request, reply) => {
    const { guestId } = z.object({ guestId: z.string().min(1).max(64) }).parse(request.params);
    const guest = await requireOwnedGuest(request.user.sub, guestId, reply);
    if (!guest) return;

    await prisma.guest.delete({ where: { id: guest.id } });

    await logEvent({
      weddingId: guest.weddingId,
      type: 'guest.deleted',
      message: `Invitado eliminado: ${guest.fullName}`,
      payload: { guestId: guest.id },
    });

    reply.send({ ok: true, id: guest.id });
  });

  /**
   * Genera un token nuevo: el enlace anterior deja de funcionar. Se usa cuando
   * la organizadora sospecha que alguien copió el enlace de otra persona.
   */
  app.post('/weddings/:id/guests/:guestId/regenerate-token', async (request, reply) => {
    const { id, guestId } = WeddingGuestParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const guest = await prisma.guest.findFirst({ where: { id: guestId, weddingId: wedding.id } });
    if (!guest) {
      sendError(reply, 404, 'Invitado no encontrado', 'Ese invitado no pertenece a esta boda.');
      return;
    }

    const updated = await prisma.guest.update({
      where: { id: guest.id },
      data: { token: generateGuestToken() },
    });

    await logEvent({
      weddingId: wedding.id,
      type: 'guest.token_regenerated',
      message: `Enlace regenerado para ${updated.fullName}`,
      payload: { guestId: updated.id },
    });

    const dto: GuestDto & { link: string } = {
      ...toGuestDto(updated),
      link: guestLink(wedding.slug, updated.token),
    };

    reply.send(dto);
  });
}
