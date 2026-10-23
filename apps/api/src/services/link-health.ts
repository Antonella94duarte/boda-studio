import { env } from '../env.js';
import { classifyPublicUrl, type PublicUrlCheck } from '../utils/public-url.js';
import { publicWeddingUrl } from './tokens.js';

/**
 * ---------------------------------------------------------------------------
 * Estado del enlace público que llevan los mensajes de WhatsApp.
 * ---------------------------------------------------------------------------
 * Une la configuración (`PUBLIC_WEB_URL`) con la clasificación de
 * `utils/public-url.ts` y decide si se puede hacer un envío **real**.
 *
 * Regla: un envío real con un enlace que no es público no se hace. Es
 * preferible una campaña en pausa con un aviso claro que 200 mensajes con un
 * enlace muerto (el número queda "quemado" y los invitados no confirman).
 *
 * El modo seco (`dryRun`) nunca se bloquea: sirve justamente para revisar el
 * texto.
 */

/** Documento con las opciones de URL pública (gratis y de bajo coste). */
export const PUBLIC_URL_DOCS = 'docs/10-url-publica.md';

export interface LinkHealth {
  /** Valor configurado, normalizado (sin barra final). */
  publicWebUrl: string;
  /** Valor configurado para la API. */
  publicApiUrl: string;
  check: PublicUrlCheck;
  /** `ALLOW_LOCAL_LINKS=true`: se permite enviar aunque el enlace sea local. */
  allowLocal: boolean;
  /** `true` si un envío real puede salir con este enlace. */
  sendable: boolean;
  /** Qué hacer cuando no se puede enviar; `null` si está todo bien. */
  remedy: string | null;
  docs: string;
}

const REMEDY =
  'Configurá PUBLIC_WEB_URL con la dirección pública donde se abre la invitación ' +
  '(por ejemplo https://bodas.tudominio.com) y reiniciá la API. Para probar en tu ' +
  'computadora usá el modo seco (dryRun); si de verdad querés enviar con un enlace ' +
  'local, poné ALLOW_LOCAL_LINKS=true.';

/** Estado actual, a partir de `PUBLIC_WEB_URL`. */
export function currentLinkHealth(): LinkHealth {
  const check = classifyPublicUrl(env.PUBLIC_WEB_URL);
  const sendable = check.isPublic || env.ALLOW_LOCAL_LINKS;

  return {
    publicWebUrl: check.url,
    publicApiUrl: env.PUBLIC_API_URL.replace(/\/+$/, ''),
    check,
    allowLocal: env.ALLOW_LOCAL_LINKS,
    sendable,
    remedy: sendable ? null : REMEDY,
    docs: PUBLIC_URL_DOCS,
  };
}

/**
 * Enlace de ejemplo, con la forma exacta que tendrá el `{{enlace}}` real.
 * Sirve para que la organizadora vea de un vistazo a dónde apuntan los mensajes.
 */
export function exampleGuestLink(slug = 'sandraujorge'): string {
  return publicWeddingUrl(slug);
}

/**
 * Línea para el arranque de la API y para `/api/health`.
 * Devuelve `null` cuando el enlace está bien y no hay nada que avisar.
 */
export function linkWarningLine(health: LinkHealth = currentLinkHealth()): string | null {
  if (health.sendable && health.check.warnings.length === 0) return null;

  if (!health.sendable) {
    return (
      `Los enlaces de las invitaciones apuntan a ${health.publicWebUrl} y NO son públicos: ` +
      `los envíos reales quedan bloqueados para no mandar enlaces muertos. ${health.remedy}`
    );
  }

  return `El enlace público ${health.publicWebUrl} se puede abrir, pero conviene revisarlo: ${health.check.warnings.join(' ')}`;
}
