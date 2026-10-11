/**
 * Ayudas mínimas de fechas. Se mantienen acá para no repetir conversiones
 * (Date | string | null) en las rutas y los serializadores.
 */

export type DateLike = Date | string | number | null | undefined;

/** Convierte cualquier entrada razonable en Date, o null si no es válida. */
export function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ISO 8601 listo para JSON, o null. */
export function toISOStringOrNull(value: DateLike): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

/** ¿La fecha ya pasó? Una fecha inválida nunca se considera pasada. */
export function isPast(value: DateLike, now: Date = new Date()): boolean {
  const date = toDate(value);
  if (!date) return false;
  return date.getTime() < now.getTime();
}

/** Medianoche de hoy en la zona del servidor: base del tope diario de envíos. */
export function startOfToday(now: Date = new Date()): Date {
  const date = new Date(now.getTime());
  date.setHours(0, 0, 0, 0);
  return date;
}
