import { randomBytes } from 'node:crypto';
import { env } from '../env.js';

/**
 * Tokens de los enlaces personalizados (`/i/<slug>/<token>`).
 */

/** 12 bytes en base64url = exactamente 16 caracteres seguros para URL. */
const TOKEN_BYTES = 12;

/**
 * Token aleatorio e imposible de adivinar. No incluye datos del invitado:
 * si alguien comparte su enlace, no se puede deducir el de otro.
 */
export function generateGuestToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function webBase(): string {
  return env.PUBLIC_WEB_URL.replace(/\/+$/, '');
}

/** Enlace personalizado del invitado. */
export function guestLink(slug: string, token: string): string {
  return `${webBase()}/i/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
}

/** Mismo enlace, anclado al formulario de confirmación. */
export function guestRsvpLink(slug: string, token: string): string {
  return `${guestLink(slug, token)}#rsvp`;
}

/** URL pública de la invitación (sin token). */
export function publicWeddingUrl(slug: string): string {
  return `${webBase()}/i/${encodeURIComponent(slug)}`;
}
