import { z } from 'zod';

/**
 * ---------------------------------------------------------------------------
 * Configuración de una invitación (una boda).
 * ---------------------------------------------------------------------------
 * Se guarda como JSON en `Wedding.config`. Todo lo que la organizadora puede
 * editar desde el panel vive aquí, de modo que agregar una sección nueva no
 * requiere tocar la base de datos, solo el esquema y el renderizador.
 *
 * Las secciones se derivan del análisis de tarjetas reales (religiosa, civil,
 * brindis, dress code, regalos, versículo, cuenta regresiva).
 */

export const SECTION_IDS = [
  'hero',
  'countdown',
  'quote',
  'story',
  'gallery',
  'events',
  'dressCode',
  'gifts',
  'rsvp',
  'closing',
] as const;

export const SectionIdSchema = z.enum(SECTION_IDS);
export type SectionId = z.infer<typeof SectionIdSchema>;

export const SectionSchema = z.object({
  id: SectionIdSchema,
  enabled: z.boolean().default(true),
  /** Menor número = aparece antes. Permite reordenar sin tocar el código. */
  order: z.number().int().default(0),
  title: z.string().optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const ThemeSchema = z.object({
  /** Variables CSS. El renderizador público las inyecta como custom properties. */
  primary: z.string().default('#8a7a63'),
  accent: z.string().default('#c9a227'),
  background: z.string().default('#fbf8f3'),
  surface: z.string().default('#ffffff'),
  text: z.string().default('#2f2a24'),
  muted: z.string().default('#7d7468'),
  fontHeading: z.string().default("'Cormorant Garamond', serif"),
  fontBody: z.string().default("'Montserrat', sans-serif"),
  /** 'elegant' | 'modern' | 'minimal' | 'rustic': presets listos para elegir. */
  preset: z.string().default('elegant'),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const EVENT_KINDS = ['religious', 'civil', 'brindis', 'party', 'other'] as const;
export const EventKindSchema = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof EventKindSchema>;

export const EventSchema = z.object({
  id: z.string(),
  kind: EventKindSchema,
  title: z.string(),
  /** ISO 8601 con zona horaria. Ej: 2026-10-30T16:30:00-03:00 */
  startAt: z.string(),
  endAt: z.string().optional(),
  venueName: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  /** Link de Google Maps / Waze para el botón "Cómo llegar". */
  mapUrl: z.string().optional(),
  notes: z.string().optional(),
  /** Cuenta regresiva: si hay varios eventos, solo uno es el principal. */
  isMain: z.boolean().default(false),
});
export type WeddingEvent = z.infer<typeof EventSchema>;

export const StorySchema = z.object({
  paragraphs: z.array(z.string()).default([]),
  /** Fotos de la pareja (URLs o rutas subidas por la organizadora). */
  photos: z.array(z.string()).default([]),
});

export const DressCodeSchema = z.object({
  title: z.string().default('Código de vestimenta'),
  text: z.string().default(''),
  palette: z.array(z.string()).default([]),
});

export const GiftAccountSchema = z.object({
  label: z.string().default('Cuenta bancaria'),
  holder: z.string().optional(),
  bank: z.string().optional(),
  number: z.string().optional(),
  alias: z.string().optional(),
  currency: z.string().optional(),
});

export const GiftsSchema = z.object({
  message: z.string().default(''),
  accounts: z.array(GiftAccountSchema).default([]),
  registryUrl: z.string().optional(),
  /** Si es true, se muestra la sección con la nota "el mejor regalo es tu presencia". */
  presenceOnly: z.boolean().default(false),
});

export const RsvpSchema = z.object({
  /** Fecha límite de confirmación (ISO, solo fecha). */
  deadline: z.string().optional(),
  /** Número que recibe las confirmaciones (formato internacional). */
  contactPhone: z.string().optional(),
  /** Confirmación en línea desde la propia invitación. */
  allowOnlineConfirm: z.boolean().default(true),
  /** Pases por defecto al crear invitados nuevos. */
  defaultPasses: z.number().int().min(1).max(20).default(2),
  /** Pedir los nombres de los acompañantes en el formulario. */
  askCompanionNames: z.boolean().default(true),
  /** Preguntar por restricciones alimentarias. */
  askDietary: z.boolean().default(true),
  /** Mensaje de agradecimiento al confirmar. */
  thanksMessage: z.string().default('¡Gracias por confirmar! Te esperamos.'),
});

export const MusicSchema = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
  /** Los navegadores móviles exigen interacción: se muestra un botón de play. */
  autoplay: z.boolean().default(false),
});

export const CoupleNamesSchema = z.object({
  bride: z.string(),
  groom: z.string(),
  /** Cómo se muestran juntos: "Vanessa y Héctor" / "Sandra y Jorge". */
  display: z.string(),
});

/* Tipos inferidos de cada pieza de la configuración. Se exportan para que la web
   y el API puedan tipar formularios y secciones sin volver a declararlos. */
export type GiftAccount = z.infer<typeof GiftAccountSchema>;
export type Gifts = z.infer<typeof GiftsSchema>;
export type DressCode = z.infer<typeof DressCodeSchema>;
export type Story = z.infer<typeof StorySchema>;
export type Rsvp = z.infer<typeof RsvpSchema>;
export type Music = z.infer<typeof MusicSchema>;
export type CoupleNames = z.infer<typeof CoupleNamesSchema>;

export const WeddingConfigSchema = z.object({
  version: z.literal(1).default(1),
  /** "vanessayhector" -> la web pública queda en /i/vanessayhector */
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  couple: CoupleNamesSchema,
  /** Título de la pestaña del navegador. */
  metaTitle: z.string().default('¡Nos casamos!'),
  /** Imagen principal (portada). */
  heroImage: z.string().optional(),
  heroTagline: z.string().default('¡Nos casamos!'),
  /** Versículo o frase (ej. Colosenses 3:4). */
  quote: z
    .object({ text: z.string().default(''), source: z.string().optional() })
    .default({ text: '' }),
  story: StorySchema.default({ paragraphs: [], photos: [] }),
  events: z.array(EventSchema).default([]),
  dressCode: DressCodeSchema.default({ title: 'Código de vestimenta', text: '', palette: [] }),
  gifts: GiftsSchema.default({ message: '', accounts: [], presenceOnly: false }),
  rsvp: RsvpSchema.default({}),
  music: MusicSchema.default({}),
  gallery: z.array(z.string()).default([]),
  closing: z.string().default('¡Gracias por acompañarnos!'),
  theme: ThemeSchema.default({}),
  sections: z.array(SectionSchema).default([]),
  /** Publicada = accesible en la URL pública. */
  published: z.boolean().default(false),
});
export type WeddingConfig = z.infer<typeof WeddingConfigSchema>;

/**
 * Devuelve las secciones visibles y ordenadas. Si la organizadora nunca tocó
 * el orden, se usa el orden natural de SECTION_IDS.
 */
export function resolveSections(config: Pick<WeddingConfig, 'sections'>): Section[] {
  const declared = new Map(config.sections.map((s) => [s.id, s]));
  return SECTION_IDS.map((id, index) => {
    const found = declared.get(id);
    return {
      id,
      enabled: found?.enabled ?? true,
      order: found?.order ?? index,
      ...(found?.title !== undefined ? { title: found.title } : {}),
    };
  })
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
}

/** Año/mes/día del evento principal, para la cuenta regresiva. */
export function mainEvent(config: Pick<WeddingConfig, 'events'>): WeddingEvent | undefined {
  return config.events.find((e) => e.isMain) ?? config.events[0];
}
