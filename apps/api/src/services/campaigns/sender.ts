import {
  TEMPLATE_VARIABLES,
  formatDateLong,
  formatPasses,
  mainEvent,
  renderTemplate,
  usedVariables,
  type TemplateContext,
  type WeddingConfig,
} from '@boda/shared';
import { env } from '../../env.js';
import { prisma } from '../../prisma.js';
import { startOfToday } from '../../utils/dates.js';
import { getEngine } from '../../whatsapp/index.js';
import { logEvent } from '../events.js';
import { guestLink } from '../tokens.js';
import { parseWeddingConfig } from '../wedding-config.js';

/**
 * ---------------------------------------------------------------------------
 * Enviador de campañas masivas de WhatsApp.
 * ---------------------------------------------------------------------------
 * Decisiones deliberadas, porque de esto depende que la cuenta de la
 * organizadora no sea bloqueada:
 *
 *  - Un solo envío a la vez por campaña (cola secuencial en proceso).
 *  - Retardo aleatorio entre mensajes (6-14 s por defecto).
 *  - Reintentos: hasta 2 intentos extra por mensaje.
 *  - El estado de la campaña se relee de la base ANTES de cada mensaje, así
 *    "pausar" y "cancelar" funcionan aunque el proceso esté en otra pestaña.
 *  - Tope diario de mensajes: al alcanzarlo, la campaña queda en pausa.
 *  - Si el invitado rechazó la invitación, no se le escribe: el ítem se marca
 *    como "skipped".
 *  - `dryRun` renderiza, guarda el texto y registra, pero NUNCA llama a
 *    WhatsApp. Es la forma de revisar la campaña completa antes de enviarla.
 */

interface RunState {
  running: boolean;
}

/** Variables que `buildTemplateContext` siempre sabe completar. */
const TEMPLATE_KEYS = new Set<string>(TEMPLATE_VARIABLES.map((variable) => variable.key));

/** Cola en proceso: una entrada por campaña en ejecución. */
const RUNNING = new Map<string, RunState>();

/** ¿Hay un bucle de envío activo para esta campaña? */
export function isRunning(campaignId: string): boolean {
  return RUNNING.get(campaignId)?.running === true;
}

/** Pide al bucle en curso que se detenga (sin tocar la base). */
function stopLocalLoop(campaignId: string): void {
  const state = RUNNING.get(campaignId);
  if (state) state.running = false;
}

/**
 * Espera cancelable: el retardo entre mensajes se corta en cuanto la campaña
 * se pausa o se cancela, en lugar de terminar los 14 segundos a ciegas.
 */
function sleep(ms: number, state?: RunState): Promise<void> {
  return new Promise((resolve) => {
    let remaining = Math.max(0, ms);
    const step = (): void => {
      if (state && !state.running) {
        resolve();
        return;
      }
      if (remaining <= 0) {
        resolve();
        return;
      }
      const chunk = Math.min(500, remaining);
      remaining -= chunk;
      setTimeout(step, chunk);
    };
    step();
  });
}

function randomDelay(minMs: number, maxMs: number): number {
  const min = Math.max(1000, minMs);
  const max = Math.max(min, maxMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Contexto de la plantilla
// ---------------------------------------------------------------------------

export interface TemplateGuest {
  fullName: string;
  token: string;
  passes: number;
}

export interface TemplateWedding {
  slug: string;
}

/**
 * Arma las variables que se reemplazan en la plantilla ({{nombre}}, {{pases}},
 * {{enlace}}, {{novios}}, {{fecha}}, {{lugar}}, {{rsvp}}).
 */
export function buildTemplateContext(
  guest: TemplateGuest,
  wedding: TemplateWedding,
  config: WeddingConfig,
): TemplateContext {
  const enlace = guestLink(wedding.slug, guest.token);
  const evento = mainEvent(config);

  return {
    nombre: guest.fullName,
    pases: formatPasses(guest.passes),
    enlace,
    novios: config.couple.display,
    fecha: evento ? formatDateLong(evento.startAt) : '',
    lugar: evento?.venueName ?? '',
    rsvp: `${enlace}#rsvp`,
  };
}

// ---------------------------------------------------------------------------
// Contadores y tope diario
// ---------------------------------------------------------------------------

async function refreshCounters(campaignId: string): Promise<void> {
  const [totalCount, sentCount, failedCount, skippedCount] = await Promise.all([
    prisma.campaignItem.count({ where: { campaignId } }),
    prisma.campaignItem.count({ where: { campaignId, status: 'sent' } }),
    prisma.campaignItem.count({ where: { campaignId, status: 'failed' } }),
    prisma.campaignItem.count({ where: { campaignId, status: 'skipped' } }),
  ]);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { totalCount, sentCount, failedCount, skippedCount },
  });
}

/** Mensajes ya enviados hoy (todas las campañas: el tope es por sesión). */
async function sentToday(): Promise<number> {
  return prisma.campaignItem.count({
    where: { status: 'sent', sentAt: { gte: startOfToday() } },
  });
}

async function dailyLimitReached(): Promise<boolean> {
  return (await sentToday()) >= env.SEND_DAILY_LIMIT;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Bucle de envío
// ---------------------------------------------------------------------------

/**
 * Arranca (o reanuda) el envío en segundo plano y devuelve de inmediato: la
 * ruta HTTP no puede quedarse esperando a que terminen 300 mensajes.
 */
export async function startCampaign(campaignId: string): Promise<void> {
  const existing = RUNNING.get(campaignId);
  if (existing?.running) return;
  // Un bucle anterior está terminando: se invalida para que no siga enviando.
  if (existing) existing.running = false;

  const state: RunState = { running: true };
  RUNNING.set(campaignId, state);

  void runCampaign(campaignId, state)
    .catch(async (error: unknown) => {
      const message = errorMessage(error);
      console.error(`[campaigns] Error inesperado en la campaña ${campaignId}:`, message);
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { weddingId: true, name: true },
      });
      await logEvent({
        weddingId: campaign?.weddingId ?? null,
        type: 'campaign.error',
        message: `La campaña "${campaign?.name ?? campaignId}" se detuvo por un error: ${message}`,
        payload: { campaignId },
      });
      // Queda en pausa (no cancelada) para poder reanudarla sin repetir envíos.
      await prisma.campaign.updateMany({
        where: { id: campaignId, status: 'running' },
        data: { status: 'paused' },
      });
      state.running = false;
    })
    .finally(() => {
      if (RUNNING.get(campaignId) === state) RUNNING.delete(campaignId);
    });
}

async function runCampaign(campaignId: string, state: RunState): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { wedding: true },
  });

  if (!campaign) {
    state.running = false;
    return;
  }
  if (campaign.status === 'cancelled' || campaign.status === 'finished') {
    state.running = false;
    return;
  }

  const wedding = campaign.wedding;
  const config = parseWeddingConfig(wedding.config, wedding.slug);
  const engine = getEngine(wedding.ownerId);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'running', startedAt: campaign.startedAt ?? new Date() },
  });

  // Ítems que quedaron en "sending" por una caída del proceso (hace más de
  // 5 minutos) vuelven a la cola; los recientes pueden estar en vuelo.
  await prisma.campaignItem.updateMany({
    where: {
      campaignId,
      status: 'sending',
      updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { status: 'pending' },
  });

  await logEvent({
    weddingId: wedding.id,
    type: 'campaign.start',
    message: `Campaña "${campaign.name}" iniciada (${campaign.dryRun ? 'modo seco' : 'envío real'}) con ${campaign.minDelayMs}-${campaign.maxDelayMs} ms entre mensajes`,
    payload: { campaignId, dryRun: campaign.dryRun, engine: engine.id },
  });

  const minDelay = campaign.minDelayMs > 0 ? campaign.minDelayMs : env.SEND_MIN_DELAY_MS;
  const maxDelay = Math.max(
    campaign.maxDelayMs > 0 ? campaign.maxDelayMs : env.SEND_MAX_DELAY_MS,
    minDelay,
  );

  const items = await prisma.campaignItem.findMany({
    where: { campaignId, status: 'pending' },
    include: { guest: true },
    orderBy: { createdAt: 'asc' },
  });

  // Variables escritas en la plantilla que el sistema no sabe completar: se
  // avisa una sola vez (no por invitado) para que el panel lo muestre.
  const unknownVariables = usedVariables(campaign.template).filter(
    (key) => !TEMPLATE_KEYS.has(key),
  );
  if (unknownVariables.length > 0) {
    await logEvent({
      weddingId: wedding.id,
      type: 'campaign.template_warning',
      message: `La plantilla usa variables desconocidas: ${unknownVariables.join(', ')}`,
      payload: { campaignId, unknownVariables },
    });
  }

  await refreshCounters(campaignId);

  let processed = 0;

  for (const item of items) {
    if (!state.running || RUNNING.get(campaignId) !== state) break;

    // Pausa / cancelación pedidas desde el panel.
    const current = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (!current || current.status === 'paused' || current.status === 'cancelled') break;

    // Tope diario: se espera al menos 10 s y solo se pausa si sigue superado.
    if (await dailyLimitReached()) {
      await logEvent({
        weddingId: wedding.id,
        type: 'campaign.daily_limit',
        message: `Se alcanzó el tope diario de ${env.SEND_DAILY_LIMIT} mensajes. La campaña "${campaign.name}" queda en pausa.`,
        payload: { campaignId, sentToday: await sentToday(), limit: env.SEND_DAILY_LIMIT },
      });
      await sleep(10_000, state);
      if (state.running && (await dailyLimitReached())) {
        await prisma.campaign.updateMany({
          where: { id: campaignId, status: 'running' },
          data: { status: 'paused' },
        });
        break;
      }
    }

    // Reclamo atómico del ítem: si el proceso se reinició o hay otro bucle,
    // el updateMany no afecta ninguna fila y el mensaje no se duplica.
    const claim = await prisma.campaignItem.updateMany({
      where: { id: item.id, status: 'pending' },
      data: { status: 'sending', attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;

    const guest = item.guest;
    const rendered = renderTemplate(campaign.template, buildTemplateContext(guest, wedding, config));

    // Invitado que ya dijo que no: no se le escribe.
    if (guest.status === 'declined') {
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: {
          status: 'skipped',
          renderedBody: rendered.body,
          error: 'El invitado rechazó la invitación',
        },
      });
      await refreshCounters(campaignId);
      processed += 1;
      if (processed < items.length) await sleep(randomDelay(minDelay, maxDelay), state);
      continue;
    }

    if (campaign.dryRun) {
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: {
          status: 'sent',
          renderedBody: rendered.body,
          sentAt: new Date(),
          error: null,
          providerMessageId: null,
        },
      });
      await logEvent({
        weddingId: wedding.id,
        type: 'campaign.dry_run',
        message: `[modo seco] Mensaje preparado para ${guest.fullName} (${guest.phone})`,
        payload: { campaignId, guestId: guest.id, body: rendered.body },
      });
      await refreshCounters(campaignId);
      processed += 1;
      if (processed < items.length) await sleep(randomDelay(minDelay, maxDelay), state);
      continue;
    }

    // Envío real: 1 intento + hasta 2 reintentos.
    let messageId: string | null = null;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const sent = await engine.sendText(guest.phone, rendered.body);
        messageId = sent.messageId;
        lastError = null;
        break;
      } catch (error) {
        lastError = errorMessage(error);
        if (attempt < 3) {
          await prisma.campaignItem.update({
            where: { id: item.id },
            data: { attempts: { increment: 1 }, error: lastError.slice(0, 500) },
          });
          await sleep(2000 * attempt, state);
          if (!state.running) break;
        }
      }
    }

    if (messageId !== null) {
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: {
          status: 'sent',
          renderedBody: rendered.body,
          sentAt: new Date(),
          error: null,
          providerMessageId: messageId,
        },
      });
      await prisma.guest.update({
        where: { id: guest.id },
        data: { messageStatus: 'sent', messageSentAt: new Date(), messageError: null },
      });
    } else {
      const message = (lastError ?? 'Error desconocido al enviar').slice(0, 500);
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: { status: 'failed', renderedBody: rendered.body, error: message },
      });
      await prisma.guest.update({
        where: { id: guest.id },
        data: { messageStatus: 'failed', messageError: message },
      });
      await logEvent({
        weddingId: wedding.id,
        type: 'campaign.failed',
        message: `No se pudo enviar a ${guest.fullName} (${guest.phone}): ${message}`,
        payload: { campaignId, guestId: guest.id },
      });
    }

    await refreshCounters(campaignId);
    processed += 1;
    if (processed < items.length) await sleep(randomDelay(minDelay, maxDelay), state);
  }

  // Cierre: si el usuario no pausó ni canceló y no queda nada pendiente, terminó.
  const final = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true, sentCount: true, failedCount: true, skippedCount: true },
  });

  if (final && final.status === 'running') {
    const pending = await prisma.campaignItem.count({
      where: { campaignId, status: { in: ['pending', 'sending'] } },
    });
    if (pending === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'finished', finishedAt: new Date() },
      });
      await logEvent({
        weddingId: wedding.id,
        type: 'campaign.finish',
        message: `Campaña "${campaign.name}" finalizada: ${final.sentCount} enviados, ${final.failedCount} fallidos, ${final.skippedCount} omitidos`,
        payload: { campaignId },
      });
    }
  }

  await refreshCounters(campaignId);
  state.running = false;
}

// ---------------------------------------------------------------------------
// Control desde el panel
// ---------------------------------------------------------------------------

export async function pauseCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaña no encontrada');
  if (campaign.status === 'finished' || campaign.status === 'cancelled') return;

  stopLocalLoop(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused' } });
  await logEvent({
    weddingId: campaign.weddingId,
    type: 'campaign.pause',
    message: `Campaña "${campaign.name}" pausada`,
    payload: { campaignId },
  });
}

export async function resumeCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaña no encontrada');
  if (campaign.status === 'cancelled' || campaign.status === 'finished') {
    throw new Error('Esta campaña ya no se puede reanudar');
  }

  stopLocalLoop(campaignId);
  // Se espera a que el bucle anterior libere el lock (a lo sumo, el mensaje en curso).
  for (let i = 0; i < 40 && RUNNING.has(campaignId); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'running' } });
  await logEvent({
    weddingId: campaign.weddingId,
    type: 'campaign.resume',
    message: `Campaña "${campaign.name}" reanudada`,
    payload: { campaignId },
  });

  await startCampaign(campaignId);
}

export async function cancelCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaña no encontrada');
  if (campaign.status === 'cancelled') return;

  stopLocalLoop(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'cancelled' } });
  await logEvent({
    weddingId: campaign.weddingId,
    type: 'campaign.cancel',
    message: `Campaña "${campaign.name}" cancelada`,
    payload: { campaignId },
  });
}
