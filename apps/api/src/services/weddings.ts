import type { FastifyReply } from 'fastify';
import type { Campaign, Guest, Wedding } from '@prisma/client';
import { prisma } from '../prisma.js';
import { toWeddingDto, EMPTY_WEDDING_COUNTS, type WeddingDto, type WeddingCounts } from './dto.js';

/**
 * ---------------------------------------------------------------------------
 * Propiedad de los recursos.
 * ---------------------------------------------------------------------------
 * La plataforma es multi-boda: TODA ruta autenticada debe verificar que la boda
 * (y por lo tanto el invitado o la campaña) pertenece a la organizadora que
 * inició sesión. Estas funciones son el único camino permitido para llegar a
 * una boda desde una ruta.
 */

export async function findOwnedWedding(userId: string, weddingId: string): Promise<Wedding | null> {
  return prisma.wedding.findFirst({ where: { id: weddingId, ownerId: userId } });
}

/** Devuelve la boda o responde 404 y devuelve null (el llamador debe hacer `return`). */
export async function requireOwnedWedding(
  userId: string,
  weddingId: string,
  reply: FastifyReply,
): Promise<Wedding | null> {
  const wedding = await findOwnedWedding(userId, weddingId);
  if (!wedding) {
    reply.code(404).send({
      error: 'Boda no encontrada',
      message: 'La boda no existe o no pertenece a tu cuenta.',
    });
    return null;
  }
  return wedding;
}

export async function findOwnedGuest(userId: string, guestId: string): Promise<Guest | null> {
  return prisma.guest.findFirst({ where: { id: guestId, wedding: { ownerId: userId } } });
}

export async function requireOwnedGuest(
  userId: string,
  guestId: string,
  reply: FastifyReply,
): Promise<Guest | null> {
  const guest = await findOwnedGuest(userId, guestId);
  if (!guest) {
    reply.code(404).send({
      error: 'Invitado no encontrado',
      message: 'El invitado no existe o no pertenece a una de tus bodas.',
    });
    return null;
  }
  return guest;
}

export async function findOwnedCampaign(userId: string, campaignId: string): Promise<Campaign | null> {
  return prisma.campaign.findFirst({
    where: { id: campaignId, wedding: { ownerId: userId } },
  });
}

export async function requireOwnedCampaign(
  userId: string,
  campaignId: string,
  reply: FastifyReply,
): Promise<Campaign | null> {
  const campaign = await findOwnedCampaign(userId, campaignId);
  if (!campaign) {
    reply.code(404).send({
      error: 'Campaña no encontrada',
      message: 'La campaña no existe o no pertenece a una de tus bodas.',
    });
    return null;
  }
  return campaign;
}

/** Contadores de una boda (panel de confirmaciones). */
export async function weddingCounts(weddingIds: string[]): Promise<Map<string, WeddingCounts>> {
  const result = new Map<string, WeddingCounts>();
  if (weddingIds.length === 0) return result;

  const [guestCounts, guestPasses, campaignCounts] = await Promise.all([
    prisma.guest.groupBy({
      by: ['weddingId', 'status'],
      where: { weddingId: { in: weddingIds } },
      _count: { _all: true },
    }),
    // Los pases son lo que el salón necesita para armar las mesas.
    prisma.guest.groupBy({
      by: ['weddingId'],
      where: { weddingId: { in: weddingIds } },
      _sum: { passes: true },
    }),
    prisma.campaign.groupBy({
      by: ['weddingId'],
      where: { weddingId: { in: weddingIds } },
      _count: { _all: true },
    }),
  ]);

  for (const id of weddingIds) {
    result.set(id, { ...EMPTY_WEDDING_COUNTS });
  }

  for (const row of guestCounts) {
    const counts = result.get(row.weddingId);
    if (!counts) continue;
    const total = row._count._all;
    counts.guests += total;
    if (row.status === 'pending') counts.pending += total;
    else if (row.status === 'confirmed') counts.confirmed += total;
    else if (row.status === 'declined') counts.declined += total;
    else if (row.status === 'maybe') counts.maybe += total;
  }

  for (const row of guestPasses) {
    const counts = result.get(row.weddingId);
    if (counts) counts.totalPasses = row._sum.passes ?? 0;
  }

  for (const row of campaignCounts) {
    const counts = result.get(row.weddingId);
    if (counts) counts.campaigns = row._count._all;
  }

  return result;
}

export async function weddingDtoWithCounts(wedding: Wedding): Promise<WeddingDto> {
  const counts = await weddingCounts([wedding.id]);
  return toWeddingDto(wedding, counts.get(wedding.id) ?? {});
}
