/**
 * ---------------------------------------------------------------------------
 * Normalización de teléfonos a E.164 (+595976178000).
 * ---------------------------------------------------------------------------
 * Es el punto más delicado de todo el sistema: un teléfono mal normalizado es
 * un mensaje que nunca llega, o peor, un mensaje enviado a un desconocido.
 * Por eso se valida antes de guardar y el panel muestra los rechazos.
 */

export interface CountryRule {
  /** ISO-3166 alpha-2 */
  iso: string;
  name: string;
  /** Código de país sin '+' */
  dial: string;
  /** Prefijo nacional que se quita al marcar (en Paraguay: 0) */
  trunkPrefix?: string;
  /** Longitudes válidas del número nacional (sin código de país ni prefijo) */
  nationalLengths: number[];
}

export const COUNTRIES: CountryRule[] = [
  { iso: 'PY', name: 'Paraguay', dial: '595', trunkPrefix: '0', nationalLengths: [9] },
  { iso: 'AR', name: 'Argentina', dial: '54', trunkPrefix: '0', nationalLengths: [10] },
  { iso: 'BR', name: 'Brasil', dial: '55', trunkPrefix: '0', nationalLengths: [10, 11] },
  { iso: 'BO', name: 'Bolivia', dial: '591', trunkPrefix: '0', nationalLengths: [8] },
  { iso: 'CL', name: 'Chile', dial: '56', trunkPrefix: '0', nationalLengths: [9] },
  { iso: 'CO', name: 'Colombia', dial: '57', trunkPrefix: '0', nationalLengths: [10] },
  { iso: 'EC', name: 'Ecuador', dial: '593', trunkPrefix: '0', nationalLengths: [9] },
  { iso: 'MX', name: 'México', dial: '52', trunkPrefix: '0', nationalLengths: [10] },
  { iso: 'PE', name: 'Perú', dial: '51', trunkPrefix: '0', nationalLengths: [9] },
  { iso: 'UY', name: 'Uruguay', dial: '598', trunkPrefix: '0', nationalLengths: [8] },
  { iso: 'VE', name: 'Venezuela', dial: '58', trunkPrefix: '0', nationalLengths: [10] },
  { iso: 'US', name: 'Estados Unidos', dial: '1', trunkPrefix: '1', nationalLengths: [10] },
  { iso: 'ES', name: 'España', dial: '34', trunkPrefix: undefined, nationalLengths: [9] },
];

export function findCountry(iso: string): CountryRule | undefined {
  return COUNTRIES.find((c) => c.iso === iso.toUpperCase());
}

export interface NormalizePhoneOptions {
  /** País por defecto cuando el número viene sin código internacional. */
  defaultCountry?: string;
}

export type NormalizePhoneResult =
  | { ok: true; e164: string; country: CountryRule; national: string }
  | { ok: false; reason: string; input: string };

const ONLY_DIGITS = /\D+/g;

/**
 * Acepta prácticamente cualquier formato que la gente escribe en un Excel:
 *   "0976 178000", "+595 976 178 000", "595976178000", "00976 178 000",
 *   "0976-178-000", "976178000", " 0976 178 000 (Sandra) "
 */
export function normalizePhone(
  input: unknown,
  options: NormalizePhoneOptions = {},
): NormalizePhoneResult {
  const raw = String(input ?? '').trim();
  const defaultCountryIso = options.defaultCountry ?? 'PY';
  const fallback = findCountry(defaultCountryIso) ?? COUNTRIES[0]!;

  if (!raw) return { ok: false, reason: 'Teléfono vacío', input: raw };

  // Si viene con texto extra ("0976 178000 Sandra"), se corta en el primer
  // carácter que no sea dígito, espacio, +, -, (, ) o /
  const cleaned = raw.replace(/[^\d+\-\s()/.]/g, ' ').trim();
  let digits = cleaned.replace(ONLY_DIGITS, '');
  const hadPlus = cleaned.startsWith('+');

  if (!digits) return { ok: false, reason: 'No contiene dígitos', input: raw };

  // "00" internacional (Europa/LATAM) -> equivale a "+"
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2);

  // Se busca el país: primero por el código internacional real, luego por el país por defecto.
  const byDial = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial));

  let country: CountryRule | undefined;
  let national: string | undefined;

  if (hadPlus || digits.startsWith('00')) {
    // Explícitamente internacional: el país debe reconocerse por el código.
    if (!byDial) {
      return { ok: false, reason: `Código de país no reconocido en "${raw}"`, input: raw };
    }
    country = byDial;
    national = digits.slice(byDial.dial.length);
  } else if (byDial && digits.length - byDial.dial.length >= 8 && digits.length > 10) {
    // Sin '+', pero con una longitud que solo cierra si ya trae el código de país.
    country = byDial;
    national = digits.slice(byDial.dial.length);
  } else {
    country = fallback;
    national = digits;
  }

  // Quitar el prefijo nacional (el 0 de "0976...").
  if (country.trunkPrefix && national.startsWith(country.trunkPrefix)) {
    const withoutTrunk = national.slice(country.trunkPrefix.length);
    // Solo si al quitarlo la longitud sigue siendo válida (en US el 1 es parte del número).
    if (
      country.nationalLengths.includes(withoutTrunk.length) ||
      !country.nationalLengths.includes(national.length)
    ) {
      national = withoutTrunk;
    }
  }

  if (!country.nationalLengths.includes(national.length)) {
    return {
      ok: false,
      reason: `Longitud inválida para ${country.name}: ${national.length} dígitos (se esperan ${country.nationalLengths.join(' o ')})`,
      input: raw,
    };
  }

  const e164 = `+${country.dial}${national}`;
  if (e164.length < 8 || e164.length > 16) {
    return { ok: false, reason: `Número fuera del rango E.164: ${e164}`, input: raw };
  }

  return { ok: true, e164, country, national };
}

/** Número sin '+' ni separadores, que es lo que espera wa.me. */
export function toWaMeNumber(e164: string): string {
  return e164.replace(ONLY_DIGITS, '');
}

/** Enlace de WhatsApp con mensaje pre-cargado (plan B semiautomático). */
export function waMeLink(e164: string, message?: string): string {
  const base = `https://wa.me/${toWaMeNumber(e164)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Presentación legible: +595 976 178 000 */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (!digits) return e164;

  // El código de país NO se puede adivinar con una expresión regular: agarrar
  // "1 a 4 dígitos" se come un dígito del número ("+5959 76 178 000"). Se busca
  // el código conocido más largo que coincida (595 antes que 5 o 59).
  const country = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((candidate) => digits.startsWith(candidate.dial));

  const national = country ? digits.slice(country.dial.length) : digits;
  // Se agrupa de derecha a izquierda: 976178000 -> "976 178 000".
  const grouped = national.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  return country ? `+${country.dial} ${grouped}`.trim() : `+${grouped}`;
}
