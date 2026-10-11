import { env } from '../env.js';
import { BaileysEngine } from './baileys-engine.js';
import { CloudApiEngine } from './cloud-api-engine.js';
import type { WhatsAppEngine } from './engine.js';
import { PreviewEngine } from './preview-engine.js';
import { attachSessionPersistence } from './session-store.js';

/**
 * ---------------------------------------------------------------------------
 * Registro de motores de WhatsApp.
 * ---------------------------------------------------------------------------
 * Un motor por usuario (cada organizadora tiene su propia sesión/número) y
 * cacheado: reconectar en cada request abriría sockets nuevos sin necesidad.
 */

const engines = new Map<string, WhatsAppEngine>();

export function createEngine(userId: string): WhatsAppEngine {
  switch (env.WHATSAPP_ENGINE) {
    case 'baileys':
      return new BaileysEngine({ sessionDir: env.WHATSAPP_SESSION_DIR, userId });
    case 'cloud-api':
      return new CloudApiEngine({
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        templateName: env.WHATSAPP_TEMPLATE_NAME,
        templateLang: env.WHATSAPP_TEMPLATE_LANG,
      });
    case 'preview':
    default:
      return new PreviewEngine();
  }
}

/** Motor del usuario, creado la primera vez que se pide. */
export function getEngine(userId: string): WhatsAppEngine {
  const cached = engines.get(userId);
  if (cached) return cached;

  const engine = createEngine(userId);
  // Todo cambio de estado o QR nuevo queda guardado en WhatsAppSession.
  attachSessionPersistence(userId, engine);
  engines.set(userId, engine);
  return engine;
}

/** Olvida los motores creados (lo usan las pruebas y el apagado ordenado). */
export function resetEngines(): void {
  engines.clear();
}
