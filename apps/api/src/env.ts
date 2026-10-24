import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * ---------------------------------------------------------------------------
 * Variables de entorno validadas con Zod.
 * ---------------------------------------------------------------------------
 * Todas tienen un valor por defecto razonable: la API debe arrancar en una
 * máquina recién clonada, sin `.env`, para que la organizadora pueda ver el
 * panel y cargar invitados aunque todavía no haya configurado WhatsApp.
 *
 * Los valores se validan al importar este módulo: si algo está mal escrito, el
 * proceso falla al arrancar con un mensaje claro en lugar de romper más tarde.
 */

/**
 * Carga los `.env` del proyecto.
 *
 * Hace falta porque ni `tsx` ni Node leen `.env` por su cuenta: sin esto, el
 * `.env` de la raíz del monorepo quedaba ignorado y la API usaba los valores
 * por defecto. En producción eso significa que `PUBLIC_WEB_URL` no se aplicaba y
 * los enlaces de los mensajes salían apuntando a `localhost`, con lo que ningún
 * invitado podía abrir su invitación.
 *
 * Las variables que ya existen en el entorno real tienen prioridad: en un
 * servidor (Railway, Render, Docker) manda la configuración de la plataforma.
 */
function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/api/src o apps/api/dist
  const candidates = [
    resolve(here, '../../../.env'), // raíz del monorepo
    resolve(here, '../../.env'), // apps/api/.env
    resolve(process.cwd(), '.env'),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    let content = '';
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1];
      const rawValue = match[2];
      if (key === undefined || rawValue === undefined) continue;
      if (process.env[key] !== undefined) continue; // el entorno real gana
      process.env[key] = rawValue.trim().replace(/^(["'])(.*)\1$/, '$2');
    }
  }
}

loadDotEnv();

/** Los `.env` suelen traer claves vacías ("WHATSAPP_ACCESS_TOKEN="): cuentan como ausentes. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Booleano de verdad.
 *
 * `z.coerce.boolean()` no sirve acá: convierte cualquier cadena no vacía a
 * `true`, así que `ALLOW_LOCAL_LINKS=false` quedaría activado, que es
 * exactamente lo contrario de lo que pide quien lo escribe.
 */
const envBoolean = z
  .preprocess((value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'si', 'sí', 'on'].includes(normalized)) return true;
    if (['', '0', 'false', 'no', 'off'].includes(normalized)) return false;
    return value; // deja que Zod falle con un mensaje claro
  }, z.boolean())
  .default(false);

const EnvSchema = z.object({
  // --- API -----------------------------------------------------------------
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),

  /**
   * Dirección pública donde se abre la invitación. Es la base del `{{enlace}}`
   * de cada mensaje: si apunta a localhost, el invitado no puede entrar (su
   * teléfono busca "localhost" en sí mismo). La API bloquea los envíos reales
   * mientras no sea una dirección pública; ver `services/link-health.ts` y
   * `docs/10-url-publica.md`.
   */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),

  /**
   * Escape hatch para probar envíos reales con un enlace de la red local
   * (por ejemplo, un teléfono propio en el mismo wifi). Nunca en producción:
   * ningún invitado podría abrir su invitación.
   */
  ALLOW_LOCAL_LINKS: envBoolean,

  // --- Base de datos ------------------------------------------------------
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),

  // --- Seguridad ----------------------------------------------------------
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres').default(
    'boda-studio-secreto-de-desarrollo-cambiar-en-produccion',
  ),
  ADMIN_EMAIL: z.string().email().default('organizadora@bodastudio.com'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD debe tener al menos 8 caracteres').default(
    'CambiarEstaClave123',
  ),

  // --- WhatsApp ------------------------------------------------------------
  WHATSAPP_ENGINE: z.enum(['preview', 'baileys', 'cloud-api']).default('preview'),
  WHATSAPP_SESSION_DIR: z.string().min(1).default('./storage/sessions'),

  // --- Archivos subidos ----------------------------------------------------
  /**
   * Carpeta de las fotos de las invitaciones. En Docker es un volumen
   * (`/app/storage/uploads`): si se pierde, las invitaciones quedan sin fotos
   * y hay que volver a subirlas.
   */
  UPLOAD_DIR: z.string().min(1).default('./storage/uploads'),

  // --- API oficial de Meta (solo si WHATSAPP_ENGINE=cloud-api) -------------
  WHATSAPP_PHONE_NUMBER_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  WHATSAPP_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  WHATSAPP_TEMPLATE_NAME: z.string().default('invitacion_boda'),
  WHATSAPP_TEMPLATE_LANG: z.string().default('es'),

  // --- Envío masivo -------------------------------------------------------
  SEND_MIN_DELAY_MS: z.coerce.number().int().min(1000).default(6000),
  SEND_MAX_DELAY_MS: z.coerce.number().int().min(1000).default(14000),
  SEND_DAILY_LIMIT: z.coerce.number().int().min(1).default(250),
});

type RawEnv = z.infer<typeof EnvSchema>;

export type Env = RawEnv & {
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
};

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida en las variables de entorno:\n${detalle}`);
  }

  const data = { ...parsed.data };

  // Un rango de retardo invertido dejaría el envío sin espera: se corrige en
  // lugar de tumbar el arranque (nunca se baja del mínimo permitido).
  if (data.SEND_MIN_DELAY_MS > data.SEND_MAX_DELAY_MS) {
    const min = Math.max(1000, data.SEND_MAX_DELAY_MS);
    data.SEND_MAX_DELAY_MS = data.SEND_MIN_DELAY_MS;
    data.SEND_MIN_DELAY_MS = min;
  }

  // Prisma lee `process.env.DATABASE_URL` por su cuenta: se escribe el valor
  // resuelto para que el cliente funcione incluso sin `.env`.
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? data.DATABASE_URL;
  process.env.NODE_ENV = process.env.NODE_ENV ?? data.NODE_ENV;

  return {
    ...data,
    isProduction: data.NODE_ENV === 'production',
    isDevelopment: data.NODE_ENV === 'development',
    isTest: data.NODE_ENV === 'test',
  };
}

export const env: Env = loadEnv();

/** ¿Están las credenciales de la API oficial de Meta? */
export function hasCloudApiCredentials(config: Env = env): boolean {
  return Boolean(config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN);
}
