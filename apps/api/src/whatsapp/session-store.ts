import { prisma } from '../prisma.js';
import type { SessionStatus, WhatsAppEngine } from './engine.js';

/**
 * ---------------------------------------------------------------------------
 * Persistencia del estado de la sesión de WhatsApp.
 * ---------------------------------------------------------------------------
 * El panel necesita ver el QR y saber si la sesión está conectada aunque la
 * API se haya reiniciado, así que el estado se guarda en WhatsAppSession.
 */

export async function saveSession(userId: string, status: SessionStatus): Promise<void> {
  const data = {
    status: status.status,
    phoneNumber: status.phoneNumber ?? null,
    lastError: status.lastError ?? null,
    ...(status.qrDataUrl ? { qrDataUrl: status.qrDataUrl, lastQrAt: new Date() } : {}),
    ...(status.status === 'connected' ? { connectedAt: new Date() } : {}),
  };

  await prisma.whatsAppSession.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/** Último estado guardado (se usa cuando el motor todavía no arrancó). */
export async function loadSession(userId: string) {
  return prisma.whatsAppSession.findUnique({ where: { userId } });
}

/**
 * Conecta el motor con la base: cada cambio de estado o QR nuevo se guarda.
 * Los errores de escritura no interrumpen el envío de mensajes.
 */
export function attachSessionPersistence(userId: string, engine: WhatsAppEngine): void {
  const persist = (status: SessionStatus): void => {
    void saveSession(userId, status).catch((error: unknown) => {
      console.error('[whatsapp] No se pudo guardar el estado de la sesión', error);
    });
  };

  engine.onStatus?.(persist);
  engine.onQr?.((qrDataUrl: string) => {
    persist({ status: 'qr', qrDataUrl });
  });
}
