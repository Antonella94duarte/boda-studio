import { WeddingConfigSchema, type WeddingConfig } from '@boda/shared';

/**
 * ---------------------------------------------------------------------------
 * Lectura y escritura de `Wedding.config`.
 * ---------------------------------------------------------------------------
 * En la base se guarda como String JSON (para que el mismo esquema sirva en
 * SQLite y en PostgreSQL); Zod es el que realmente valida.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

/** Deja cualquier texto en un slug válido para la URL pública. */
export function normalizeSlug(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length >= 3) return base.slice(0, 60);
  return `boda-${base === '' ? 'demo' : base}`.slice(0, 60);
}

/** Configuración mínima válida para una boda recién creada. */
export function defaultConfig(slug: string, bride = 'Novia', groom = 'Novio'): WeddingConfig {
  return WeddingConfigSchema.parse({
    slug: normalizeSlug(slug),
    couple: { bride, groom, display: `${bride} y ${groom}` },
  });
}

/**
 * Interpreta la configuración guardada.
 *
 * Si el JSON está roto o ya no cumple el esquema (por ejemplo, una boda creada
 * con una versión anterior), se completan los valores por defecto en lugar de
 * romper la invitación pública: la web nunca debe quedar en blanco.
 */
export function parseWeddingConfig(raw: unknown, fallbackSlug = 'boda'): WeddingConfig {
  const candidate = typeof raw === 'string' ? safeJson(raw) : raw;

  const direct = WeddingConfigSchema.safeParse(candidate);
  if (direct.success) return direct.data;

  const safeFallback = normalizeSlug(fallbackSlug);
  const withSlug = WeddingConfigSchema.safeParse({
    ...(isRecord(candidate) ? candidate : {}),
    slug: safeFallback,
  });
  if (withSlug.success) return withSlug.data;

  return defaultConfig(safeFallback);
}

export function serializeWeddingConfig(config: WeddingConfig): string {
  return JSON.stringify(config);
}

/**
 * Aplica un parche parcial sobre la configuración actual (PATCH del panel).
 * La fusión es por clave de primer nivel: lo que no se envía, no se toca.
 */
export function mergeWeddingConfig(
  current: WeddingConfig,
  patch: unknown,
  slug: string,
): WeddingConfig {
  const base = isRecord(patch) ? patch : {};
  return WeddingConfigSchema.parse({ ...current, ...base, slug });
}
