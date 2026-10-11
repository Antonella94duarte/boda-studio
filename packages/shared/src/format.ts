/**
 * Utilidades de formato compartidas entre la API, el panel y la invitación.
 */

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "sábado 11 de julio de 2026" — se calcula en la zona del evento, no del servidor. */
export function formatDateLong(iso: string, timeZone = 'America/Asuncion'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('es-PY', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  const month = Number(get('month'));
  return `${weekday} ${Number(get('day'))} de ${MONTHS_ES[month - 1] ?? ''} de ${get('year')}`;
}

/** "16:30" en la zona del evento. */
export function formatTime(iso: string, timeZone = 'America/Asuncion'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-PY', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** "Viernes 30 de Octubre de 2026" con inicial mayúscula. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2 personas" / "1 persona" */
export function formatPasses(passes: number): string {
  return passes === 1 ? '1 persona' : `${passes} personas`;
}

/** Días, horas, minutos y segundos que faltan para una fecha. */
export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  finished: boolean;
}

export function countdownTo(iso: string, now: Date = new Date()): Countdown {
  const target = new Date(iso).getTime();
  const diff = target - now.getTime();
  if (Number.isNaN(target) || diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, finished: true };
  }
  const seconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
    finished: false,
  };
}

export function dayNames(): string[] {
  return [...DAYS_ES];
}
