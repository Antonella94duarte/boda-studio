import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { WeddingConfigSchema, type WeddingConfig } from '@boda/shared';
import { env } from '../src/env.js';
import { prisma } from '../src/prisma.js';
import { buildPreview, resolveImportOptions } from '../src/services/import/build-preview.js';
import { commitImport } from '../src/services/import/commit-import.js';
import { parseFileToRows } from '../src/services/import/parse-file.js';
import { guestLink, publicWeddingUrl } from '../src/services/tokens.js';
import { isRecord, parseWeddingConfig, serializeWeddingConfig } from '../src/services/wedding-config.js';

/**
 * ---------------------------------------------------------------------------
 * Datos iniciales (seed).
 * ---------------------------------------------------------------------------
 *   1. Crea (o actualiza) la cuenta de la organizadora con ADMIN_EMAIL y
 *      ADMIN_PASSWORD (bcrypt).
 *   2. Carga la boda de demostración desde `samples/boda-sandra-jorge.json`.
 *      Si el archivo no existe, usa una configuración mínima embebida: el seed
 *      nunca falla por falta de archivos de ejemplo.
 *   3. Importa los invitados de `samples/invitados.csv` con el MISMO lector que
 *      usa el panel (detección de columnas, normalización de teléfonos, etc.).
 *
 * Es idempotente: se puede correr las veces que haga falta.
 */

const SAMPLE_WEDDING_URL = new URL('../../../samples/boda-sandra-jorge.json', import.meta.url);
const SAMPLE_GUESTS_URL = new URL('../../../samples/invitados.csv', import.meta.url);

const DEMO_SLUG = 'sandra-y-jorge';

/** Configuración embebida de respaldo (si falta el archivo de ejemplo). */
const DEMO_CONFIG: WeddingConfig = WeddingConfigSchema.parse({
  slug: DEMO_SLUG,
  couple: { bride: 'Sandra', groom: 'Jorge', display: 'Sandra y Jorge' },
  metaTitle: '¡Nos casamos! — Sandra y Jorge',
  heroTagline: '¡Nos casamos!',
  quote: { text: 'El amor es paciente, es bondadoso.', source: '1 Corintios 13:4' },
  events: [
    {
      id: 'ceremonia',
      kind: 'religious',
      title: 'Ceremonia religiosa',
      startAt: '2026-10-30T16:30:00-03:00',
      venueName: 'Parroquia San Rafael',
      address: 'Av. España 1234',
      city: 'Asunción',
      isMain: true,
    },
    {
      id: 'fiesta',
      kind: 'party',
      title: 'Recepción y fiesta',
      startAt: '2026-10-30T20:00:00-03:00',
      venueName: 'Salón Los Jardines',
      city: 'Asunción',
      isMain: false,
    },
  ],
  story: {
    paragraphs: [
      'Nos conocimos en la facultad y desde entonces no nos separamos.',
      'Hoy queremos celebrar con las personas que queremos.',
    ],
    photos: [],
  },
  rsvp: { deadline: '2026-10-10', defaultPasses: 2 },
  closing: '¡Gracias por acompañarnos!',
  published: true,
});

async function readSampleWedding(): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(SAMPLE_WEDDING_URL, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** Acepta tanto "config directa" como "{ title, slug, config }". */
function weddingFromSample(sample: unknown): { slug: string; title: string; config: WeddingConfig } {
  if (isRecord(sample)) {
    const inner = isRecord(sample.config) ? sample.config : sample;
    const rawSlug =
      typeof inner.slug === 'string'
        ? inner.slug
        : typeof sample.slug === 'string'
          ? sample.slug
          : DEMO_SLUG;

    const config = parseWeddingConfig(inner, rawSlug);
    // El slug de la fila y el de la configuración deben coincidir siempre.
    const slug = config.slug;
    const title =
      typeof sample.title === 'string' && sample.title.trim() !== ''
        ? sample.title
        : `${config.couple.display} — ${slug}`;

    return { slug, title, config };
  }

  const config = parseWeddingConfig(DEMO_CONFIG, DEMO_SLUG);
  return { slug: config.slug, title: `${config.couple.display} — demostración`, config };
}

async function seedPlanner(): Promise<{ id: string; email: string; password: string }> {
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Organizadora', passwordHash, role: 'planner' },
    update: { passwordHash, name: 'Organizadora' },
  });

  return { id: user.id, email: user.email, password };
}

interface GuestSeedSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  available: boolean;
}

async function seedGuests(weddingId: string): Promise<GuestSeedSummary> {
  const empty: GuestSeedSummary = { created: 0, updated: 0, skipped: 0, errors: 0, available: false };

  let buffer: Buffer;
  try {
    buffer = await readFile(SAMPLE_GUESTS_URL);
  } catch {
    return empty;
  }

  const parsed = await parseFileToRows(buffer, 'invitados.csv');
  const options = resolveImportOptions({
    defaultCountry: 'PY',
    defaultPasses: 2,
    onDuplicate: 'skip',
    groupByFamily: true,
  });

  const preview = buildPreview({ headers: parsed.headers, rows: parsed.rows, options });
  const result = await commitImport({ weddingId, rows: preview.rows, options });

  return {
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors.length,
    available: true,
  };
}

async function main(): Promise<void> {
  const planner = await seedPlanner();

  const sample = await readSampleWedding();
  const { slug, title, config } = weddingFromSample(sample);
  config.published = true;

  const wedding = await prisma.wedding.upsert({
    where: { slug },
    create: {
      slug,
      title,
      config: serializeWeddingConfig(config),
      published: config.published,
      ownerId: planner.id,
    },
    update: {
      title,
      config: serializeWeddingConfig(config),
      published: config.published,
      ownerId: planner.id,
    },
  });

  const guests = await seedGuests(wedding.id);

  const totalGuests = await prisma.guest.count({ where: { weddingId: wedding.id } });
  const confirmed = await prisma.guest.count({
    where: { weddingId: wedding.id, status: 'confirmed' },
  });
  const firstGuest = await prisma.guest.findFirst({
    where: { weddingId: wedding.id },
    orderBy: { fullName: 'asc' },
  });

  const linea = '='.repeat(64);
  console.info(
    [
      '',
      linea,
      ' Boda Studio — datos iniciales listos',
      linea,
      ` Panel:        ${env.PUBLIC_WEB_URL}`,
      ` API:          ${env.PUBLIC_API_URL}/api/health`,
      ` Usuario:      ${planner.email}`,
      ` Contraseña:   ${planner.password}`,
      '',
      ` Boda:         ${wedding.title}`,
      ` Invitación:   ${publicWeddingUrl(wedding.slug)}`,
      ` Invitados:    ${totalGuests} (${confirmed} confirmados)`,
      sample === null
        ? ' Nota:         no se encontró samples/boda-sandra-jorge.json, se usó la configuración embebida'
        : ' Fuente:       samples/boda-sandra-jorge.json',
      guests.available
        ? ` Importación:  ${guests.created} creados, ${guests.updated} actualizados, ${guests.skipped} omitidos, ${guests.errors} con error`
        : ' Nota:         no se encontró samples/invitados.csv, no se importaron invitados',
      firstGuest
        ? ` Enlace demo:  ${guestLink(wedding.slug, firstGuest.token)}`
        : '',
      '',
      ' Comandos útiles:',
      '   pnpm --filter @boda/api dev        (API en modo desarrollo)',
      '   pnpm --filter @boda/api db:studio  (explorar la base)',
      linea,
      '',
    ].join('\n'),
  );
}

main()
  .catch((error: unknown) => {
    console.error('El seed falló:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
