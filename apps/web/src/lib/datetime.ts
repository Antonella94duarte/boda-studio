/**
 * Utilidades de fecha/hora para el editor.
 * ---------------------------------------------------------------------------
 * El esquema guarda `startAt` como ISO 8601 con zona horaria
 * ("2026-10-30T16:30:00-03:00"), pero los campos nativos del navegador trabajan
 * con "2026-10-30" y "16:30" por separado. Estas funciones hacen el ida y vuelta
 * conservando el offset original: si se perdiera, la hora del evento cambiaría
 * para los invitados que abren la invitación desde otro país.
 */

export interface DateParts {
  /** yyyy-mm-dd para <input type="date"> */
  date: string;
  /** HH:mm para <input type="time"> */
  time: string;
}

const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/;

/** Offset por defecto: Paraguay (UTC-3 todo el año desde 2024). */
export const DEFAULT_OFFSET = '-03:00';

export function splitDateTime(iso: string | undefined): DateParts {
  if (!iso) return { date: '', time: '' };
  const match = ISO_RE.exec(iso.trim());
  if (!match) {
    // Puede venir como "2026-10-30" (solo fecha).
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso.trim());
    return { date: dateOnly ? iso.trim() : '', time: '' };
  }
  return { date: match[1] ?? '', time: match[2] ?? '' };
}

export function joinDateTime(
  date: string,
  time: string,
  offset: string = DEFAULT_OFFSET,
): string | undefined {
  if (!date) return undefined;
  const safeTime = time || '00:00';
  const safeOffset = /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : DEFAULT_OFFSET;
  return `${date}T${safeTime}:00${safeOffset}`;
}

/** Extrae el offset ("-03:00") de un ISO, o el de Paraguay si no tiene. */
export function offsetOf(iso: string | undefined): string {
  if (!iso) return DEFAULT_OFFSET;
  const match = /([+-]\d{2}:\d{2}|Z)$/.exec(iso.trim());
  if (!match) return DEFAULT_OFFSET;
  return match[1] === 'Z' ? '+00:00' : match[1] ?? DEFAULT_OFFSET;
}

/** Fecha de hoy en formato yyyy-mm-dd (zona local del navegador). */
export function todayIso(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
