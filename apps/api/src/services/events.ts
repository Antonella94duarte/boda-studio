import { prisma } from '../prisma.js';

/**
 * ---------------------------------------------------------------------------
 * Bitácora de eventos (tabla EventLog).
 * ---------------------------------------------------------------------------
 * Responde a la pregunta "¿a quién le llegó y cuándo?". Se escribe desde las
 * importaciones, los envíos y las confirmaciones de los invitados.
 */

export type EventType =
  | 'import.preview'
  | 'import.commit'
  | 'campaign.start'
  | 'campaign.finish'
  | 'campaign.pause'
  | 'campaign.resume'
  | 'campaign.cancel'
  | 'campaign.failed'
  | 'campaign.dry_run'
  | 'campaign.daily_limit'
  | 'campaign.error'
  | 'guest.rsvp'
  | 'guest.created'
  | 'guest.token_regenerated'
  | 'whatsapp.status'
  | string;

export interface LogEventArgs {
  weddingId?: string | null;
  type: EventType;
  message: string;
  payload?: unknown;
}

function serializePayload(payload: unknown): string | null {
  if (payload === undefined || payload === null) return null;
  try {
    const json = JSON.stringify(payload);
    return json ?? null;
  } catch {
    // Payloads con referencias circulares no deben romper la operación.
    return null;
  }
}

/**
 * Registra un evento. Nunca lanza: la bitácora no puede tumbar un envío ni una
 * confirmación. Si falla, queda el log del proceso.
 */
export async function logEvent(args: LogEventArgs): Promise<void> {
  try {
    await prisma.eventLog.create({
      data: {
        weddingId: args.weddingId ?? null,
        type: args.type,
        message: args.message,
        payload: serializePayload(args.payload),
      },
    });
  } catch (error) {
    console.error(`[events] No se pudo registrar el evento "${args.type}"`, error);
  }
}

/** Últimos eventos de una boda (para el panel). */
export async function recentEvents(weddingId: string, take = 50) {
  return prisma.eventLog.findMany({
    where: { weddingId },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
