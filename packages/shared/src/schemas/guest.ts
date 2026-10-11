import { z } from 'zod';

/**
 * ---------------------------------------------------------------------------
 * Invitado y confirmación (RSVP).
 * ---------------------------------------------------------------------------
 */

export const RSVP_STATUSES = ['pending', 'confirmed', 'declined', 'maybe'] as const;
export const RsvpStatusSchema = z.enum(RSVP_STATUSES);
export type RsvpStatus = z.infer<typeof RsvpStatusSchema>;

export const MESSAGE_STATUSES = [
  'not_sent',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'skipped',
] as const;
export const MessageStatusSchema = z.enum(MESSAGE_STATUSES);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const GuestSchema = z.object({
  id: z.string(),
  weddingId: z.string(),
  /** Token del enlace personalizado: /i/<slug>/<token> */
  token: z.string(),
  fullName: z.string().min(1),
  /** Tal como venía en el archivo importado (para auditoría). */
  rawPhone: z.string().optional(),
  /** Normalizado a E.164: +595976178000. Es el que se usa para enviar. */
  phone: z.string(),
  /** Pases/cupos: "Válido para 2 personas". */
  passes: z.number().int().min(1).max(20).default(2),
  /** Grupo familiar o mesa: permite agrupar y enviar un solo mensaje por familia. */
  groupName: z.string().optional(),
  notes: z.string().optional(),
  status: RsvpStatusSchema.default('pending'),
  /** Nombres de quienes acompañan, cargados por el invitado o por la organizadora. */
  companions: z.array(z.string()).default([]),
  dietary: z.string().optional(),
  guestMessage: z.string().optional(),
  respondedAt: z.string().optional(),
  messageStatus: MessageStatusSchema.default('not_sent'),
  messageSentAt: z.string().optional(),
  messageError: z.string().optional(),
  createdAt: z.string(),
});
export type Guest = z.infer<typeof GuestSchema>;

/** Lo que ve el invitado al abrir su enlace. No expone teléfonos ni notas internas. */
export const PublicGuestSchema = GuestSchema.pick({
  token: true,
  fullName: true,
  passes: true,
  status: true,
  companions: true,
  respondedAt: true,
});
export type PublicGuest = z.infer<typeof PublicGuestSchema>;

export const RsvpSubmissionSchema = z.object({
  attending: z.enum(['yes', 'no', 'maybe']),
  /** Nombres de los acompañantes (sin incluir al titular). */
  companions: z.array(z.string().min(1)).max(20).default([]),
  dietary: z.string().max(500).optional(),
  message: z.string().max(1000).optional(),
});
export type RsvpSubmission = z.infer<typeof RsvpSubmissionSchema>;

export const GuestInputSchema = GuestSchema.pick({
  fullName: true,
  passes: true,
}).extend({
  phone: z.string().min(6),
  groupName: z.string().optional(),
  notes: z.string().optional(),
});
export type GuestInput = z.infer<typeof GuestInputSchema>;
