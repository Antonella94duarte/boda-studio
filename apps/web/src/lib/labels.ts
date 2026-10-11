/**
 * Etiquetas en español para los enums del contrato. Se usan tanto en la
 * invitación pública como en el editor del panel, para que la organizadora vea
 * exactamente el mismo texto en los dos lados.
 */

import type { EventKind, MessageStatus, RsvpStatus } from '@boda/shared';

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  religious: 'Boda Religiosa',
  civil: 'Boda Civil',
  brindis: 'Brindis',
  party: 'Fiesta',
  other: 'Otro',
};

/** Íconos discretos por tipo de evento (SVG inline, sin librerías). */
export const EVENT_KIND_ICONS: Record<EventKind, string> = {
  religious: '✝',
  civil: '⚭',
  brindis: '🥂',
  party: '♪',
  other: '✦',
};

export const RSVP_STATUS_LABELS: Record<RsvpStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  declined: 'No asiste',
  maybe: 'Tal vez',
};

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  not_sent: 'Sin enviar',
  queued: 'En cola',
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'Falló',
  skipped: 'Omitido',
};

export const DUPLICATE_LABELS: Record<'skip' | 'update' | 'duplicate', string> = {
  skip: 'Omitir el repetido (recomendado)',
  update: 'Actualizar los datos del invitado existente',
  duplicate: 'Crear un invitado nuevo igual',
};
