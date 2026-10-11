import { z } from 'zod';

/**
 * ---------------------------------------------------------------------------
 * Campañas de envío masivo por WhatsApp.
 * ---------------------------------------------------------------------------
 * Una campaña guarda la plantilla y el estado de cada envío, de modo que si el
 * proceso se cae a mitad, se puede reanudar sin repetir mensajes.
 */

export const CAMPAIGN_STATUSES = ['draft', 'running', 'paused', 'finished', 'cancelled'] as const;
export const CampaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CAMPAIGN_ITEM_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
  'skipped',
] as const;
export const CampaignItemStatusSchema = z.enum(CAMPAIGN_ITEM_STATUSES);
export type CampaignItemStatus = z.infer<typeof CampaignItemStatusSchema>;

export const CampaignSchema = z.object({
  id: z.string(),
  weddingId: z.string(),
  name: z.string(),
  /** Plantilla con variables {{nombre}}, {{pases}}, {{enlace}}, ... */
  template: z.string().min(1),
  status: CampaignStatusSchema,
  totalCount: z.number().int(),
  sentCount: z.number().int(),
  failedCount: z.number().int(),
  skippedCount: z.number().int(),
  /** Modo seco: renderiza y registra, pero no envía. Ideal para la primera prueba. */
  dryRun: z.boolean().default(true),
  minDelayMs: z.number().int(),
  maxDelayMs: z.number().int(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const CampaignItemSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  guestId: z.string(),
  guestName: z.string(),
  phone: z.string(),
  status: CampaignItemStatusSchema,
  /** Texto final que se envió (o se enviaría, en modo seco). */
  renderedBody: z.string(),
  attempts: z.number().int(),
  sentAt: z.string().optional(),
  error: z.string().optional(),
});
export type CampaignItem = z.infer<typeof CampaignItemSchema>;

export const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  template: z.string().min(1),
  /** Si se omite, se envía a todos los invitados con estado RSVP 'pending'. */
  guestIds: z.array(z.string()).optional(),
  dryRun: z.boolean().default(true),
  minDelayMs: z.number().int().min(1000).optional(),
  maxDelayMs: z.number().int().min(1000).optional(),
});
export type CreateCampaign = z.infer<typeof CreateCampaignSchema>;

/**
 * Variables disponibles en la plantilla del mensaje.
 * Se documentan en el panel para que la organizadora sepa qué puede usar.
 */
export const TEMPLATE_VARIABLES = [
  { key: 'nombre', label: 'Nombre del invitado', example: 'Ana Gómez' },
  { key: 'pases', label: 'Pases', example: '2 personas' },
  { key: 'enlace', label: 'Enlace a la invitación', example: 'https://.../i/ana/8f3c...' },
  { key: 'novios', label: 'Nombres de la pareja', example: 'Vanessa y Héctor' },
  { key: 'fecha', label: 'Fecha del evento', example: 'sábado 11 de julio de 2026' },
  { key: 'lugar', label: 'Lugar principal', example: 'Casa Ardissone, Asunción' },
  { key: 'rsvp', label: 'Enlace directo para confirmar', example: 'https://.../i/ana/8f3c...#rsvp' },
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]['key'];

export interface TemplateContext {
  nombre: string;
  pases: string;
  enlace: string;
  novios: string;
  fecha: string;
  lugar: string;
  rsvp: string;
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/**
 * Reemplaza {{variable}} por su valor. Deja intactas las variables
 * desconocidas y las reporta, para que el panel avise del error antes de enviar.
 */
export function renderTemplate(
  template: string,
  context: Partial<TemplateContext>,
): { body: string; missing: string[] } {
  const missing = new Set<string>();
  const body = template.replace(VARIABLE_RE, (match, rawKey: string) => {
    const key = rawKey.toLowerCase() as TemplateVariable;
    const value = context[key];
    if (value === undefined || value === null || value === '') {
      missing.add(key);
      return match;
    }
    return String(value);
  });
  return { body, missing: [...missing] };
}

/** Lista las variables usadas en una plantilla. */
export function usedVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(VARIABLE_RE)) {
    if (m[1]) found.add(m[1].toLowerCase());
  }
  return [...found];
}

/**
 * Plantilla por defecto, tomada del mensaje real que la organizadora ya envía
 * a mano, pero personalizada por invitado.
 */
export const DEFAULT_TEMPLATE = `¡Hola {{nombre}}! Tenemos una noticia muy especial: ¡Nos casamos! 💍✨

Queremos que seas parte de este día tan importante para nosotros el próximo 🗓️ {{fecha}}.

En el siguiente enlace podrás ver todos los detalles del evento:
👉 {{enlace}}

✅ Válido para {{pases}}

Para ayudarnos con la organización, te pedimos que nos confirmes tu asistencia respondiendo a este mensaje o desde el propio enlace. Por favor, escríbenos los nombres de quienes te acompañarán, para tenerles todo preparado. 🥳

¡Te esperamos para celebrar juntos!
Con cariño, {{novios}}.`;
