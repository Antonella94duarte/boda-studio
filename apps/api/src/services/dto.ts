import type {
  Campaign as PrismaCampaign,
  CampaignItem as PrismaCampaignItem,
  Guest as PrismaGuest,
  Wedding as PrismaWedding,
} from '@prisma/client';
import {
  CampaignItemStatusSchema,
  CampaignStatusSchema,
  MessageStatusSchema,
  RsvpStatusSchema,
  type Campaign,
  type CampaignItem,
  type Guest,
  type PublicGuest,
  type WeddingConfig,
} from '@boda/shared';
import { toISOStringOrNull } from '../utils/dates.js';
import { parseWeddingConfig } from './wedding-config.js';

/**
 * ---------------------------------------------------------------------------
 * Serializadores: de fila de Prisma a JSON que consume el panel.
 * ---------------------------------------------------------------------------
 * Criterios:
 *  - Las fechas salen como ISO 8601 (o se omiten, nunca como `null`).
 *  - Los campos opcionales que en la base son NULL se omiten del JSON.
 *  - `Wedding.config` sale ya parseado (objeto), no como el String guardado.
 *  - `Guest.companions` (String JSON en la base) sale como arreglo.
 */

export interface WeddingCounts {
  guests: number;
  /** Suma de pases de todos los invitados: lo que pide el salón. */
  totalPasses: number;
  pending: number;
  confirmed: number;
  declined: number;
  maybe: number;
  campaigns: number;
}

export interface WeddingDto {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  config: WeddingConfig;
  createdAt: string;
  updatedAt: string;
  counts: WeddingCounts;
}

export const EMPTY_WEDDING_COUNTS: WeddingCounts = {
  guests: 0,
  totalPasses: 0,
  pending: 0,
  confirmed: 0,
  declined: 0,
  maybe: 0,
  campaigns: 0,
};

export function toWeddingDto(
  wedding: PrismaWedding,
  counts: Partial<WeddingCounts> = {},
): WeddingDto {
  return {
    id: wedding.id,
    slug: wedding.slug,
    title: wedding.title,
    published: wedding.published,
    config: parseWeddingConfig(wedding.config, wedding.slug),
    createdAt: wedding.createdAt.toISOString(),
    updatedAt: wedding.updatedAt.toISOString(),
    counts: { ...EMPTY_WEDDING_COUNTS, ...counts },
  };
}

/** Invitado tal como lo ve el panel: igual al contrato compartido + updatedAt. */
export type GuestDto = Guest & { updatedAt: string };

export function parseCompanions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  } catch {
    // Una fila corrupta no debe romper el listado completo.
    return [];
  }
}

export function toGuestDto(guest: PrismaGuest): GuestDto {
  return {
    id: guest.id,
    weddingId: guest.weddingId,
    token: guest.token,
    fullName: guest.fullName,
    rawPhone: guest.rawPhone ?? undefined,
    phone: guest.phone,
    passes: guest.passes,
    groupName: guest.groupName ?? undefined,
    notes: guest.notes ?? undefined,
    status: RsvpStatusSchema.catch('pending').parse(guest.status),
    companions: parseCompanions(guest.companions),
    dietary: guest.dietary ?? undefined,
    guestMessage: guest.guestMessage ?? undefined,
    respondedAt: toISOStringOrNull(guest.respondedAt) ?? undefined,
    messageStatus: MessageStatusSchema.catch('not_sent').parse(guest.messageStatus),
    messageSentAt: toISOStringOrNull(guest.messageSentAt) ?? undefined,
    messageError: guest.messageError ?? undefined,
    createdAt: guest.createdAt.toISOString(),
    updatedAt: guest.updatedAt.toISOString(),
  };
}

/** Lo que ve el invitado: sin teléfono, sin notas internas, sin estados de envío. */
export function toPublicGuest(guest: PrismaGuest): PublicGuest {
  return {
    token: guest.token,
    fullName: guest.fullName,
    passes: guest.passes,
    status: RsvpStatusSchema.catch('pending').parse(guest.status),
    companions: parseCompanions(guest.companions),
    respondedAt: toISOStringOrNull(guest.respondedAt) ?? undefined,
  };
}

export function toCampaignDto(campaign: PrismaCampaign): Campaign {
  return {
    id: campaign.id,
    weddingId: campaign.weddingId,
    name: campaign.name,
    template: campaign.template,
    status: CampaignStatusSchema.catch('draft').parse(campaign.status),
    totalCount: campaign.totalCount,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
    skippedCount: campaign.skippedCount,
    dryRun: campaign.dryRun,
    minDelayMs: campaign.minDelayMs,
    maxDelayMs: campaign.maxDelayMs,
    createdAt: campaign.createdAt.toISOString(),
    startedAt: toISOStringOrNull(campaign.startedAt) ?? undefined,
    finishedAt: toISOStringOrNull(campaign.finishedAt) ?? undefined,
  };
}

export type CampaignItemDto = CampaignItem & { providerMessageId: string | null };

export function toCampaignItemDto(
  item: PrismaCampaignItem,
  guest: Pick<PrismaGuest, 'fullName' | 'phone'>,
): CampaignItemDto {
  return {
    id: item.id,
    campaignId: item.campaignId,
    guestId: item.guestId,
    guestName: guest.fullName,
    phone: guest.phone,
    status: CampaignItemStatusSchema.catch('pending').parse(item.status),
    renderedBody: item.renderedBody,
    attempts: item.attempts,
    sentAt: toISOStringOrNull(item.sentAt) ?? undefined,
    error: item.error ?? undefined,
    providerMessageId: item.providerMessageId,
  };
}
