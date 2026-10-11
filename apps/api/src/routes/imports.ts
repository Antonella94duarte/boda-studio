import { extname } from 'node:path';
import { ImportOptionsSchema, type ImportPreview, type ImportRowPreview } from '@boda/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { logEvent } from '../services/events.js';
import { buildPreview, recountPreview, resolveImportOptions } from '../services/import/build-preview.js';
import { commitImport } from '../services/import/commit-import.js';
import { cellToString, parseFileToRows } from '../services/import/parse-file.js';
import { safeJson } from '../services/wedding-config.js';
import { requireOwnedWedding } from '../services/weddings.js';
import { IdParamsSchema, httpError, sendError } from './helpers.js';

/**
 * ---------------------------------------------------------------------------
 * Importación de invitados.
 * ---------------------------------------------------------------------------
 * Dos pasos, siempre:
 *   1. POST .../import/preview  -> sube el archivo (o manda las filas) y
 *      devuelve exactamente qué se va a importar, con los errores marcados.
 *   2. POST .../import/commit   -> guarda las filas revisadas.
 *
 * Nada se escribe en la base durante la previsualización.
 */

/** Espejo Zod de `ImportRowPreview` (el contrato compartido solo lo declara como tipo). */
const ImportRowPreviewSchema = z.object({
  row: z.number().int().nonnegative(),
  fullName: z.string(),
  rawPhone: z.string(),
  phone: z.string().optional(),
  passes: z.number().int().min(1).max(20),
  groupName: z.string().optional(),
  notes: z.string().optional(),
  level: z.enum(['ok', 'warning', 'error']),
  issues: z.array(z.string()).default([]),
});

const PreviewBodySchema = z.object({
  headers: z.array(z.string()).optional(),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, 'No hay filas para previsualizar'),
  options: ImportOptionsSchema.partial().optional(),
});

const CommitBodySchema = z.object({
  rows: z.array(ImportRowPreviewSchema).min(1, 'No hay filas para importar'),
  options: ImportOptionsSchema.partial().optional(),
});

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.txt', '.tsv'];

interface CollectedUpload {
  buffer: Buffer;
  filename: string;
  optionsRaw?: string;
}

/** ¿La fila ya viene mapeada desde el panel (tiene nivel y nombre)? */
function isPreviewRow(row: Record<string, unknown>): boolean {
  return typeof row.level === 'string' && typeof row.fullName === 'string' && 'rawPhone' in row;
}

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    record[key] = cellToString(value);
  }
  return record;
}

/**
 * Lee las partes del formulario en cualquier orden (el navegador puede mandar
 * el archivo antes o después del campo `options`).
 */
async function collectUpload(request: FastifyRequest): Promise<CollectedUpload> {
  let file: { buffer: Buffer; filename: string } | null = null;
  let optionsRaw: string | undefined;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (file) continue; // Solo se procesa el primer archivo.
      file = { buffer: await part.toBuffer(), filename: part.filename ?? '' };
      continue;
    }
    if (part.fieldname === 'options' || part.fieldname === 'opciones') {
      optionsRaw = String(part.value);
    }
  }

  if (!file) {
    throw httpError(400, 'El formulario debe incluir el archivo en el campo "file"');
  }
  return optionsRaw === undefined ? file : { ...file, optionsRaw };
}

export default async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.post('/weddings/:id/import/preview', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    // --- Caso 1: archivo (multipart/form-data) -----------------------------
    if (request.isMultipart()) {
      const upload = await collectUpload(request);

      const extension = extname(upload.filename).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        sendError(
          reply,
          400,
          'Formato no soportado',
          `Se aceptan .xlsx, .xls, .csv, .txt y .tsv (llegó "${extension || 'sin extensión'}").`,
        );
        return;
      }

      const options = resolveImportOptions(
        upload.optionsRaw ? safeJson(upload.optionsRaw) : {},
      );

      const parsed = await parseFileToRows(upload.buffer, upload.filename);
      const preview = buildPreview({ headers: parsed.headers, rows: parsed.rows, options });

      await logEvent({
        weddingId: wedding.id,
        type: 'import.preview',
        message: `Previsualización de "${upload.filename}": ${preview.validRows + preview.warningRows} filas importables y ${preview.errorRows} con error`,
        payload: {
          filename: upload.filename,
          totalRows: preview.totalRows,
          headers: preview.headers,
        },
      });

      reply.send(preview);
      return;
    }

    // --- Caso 2: filas ya cargadas en el panel (JSON) ----------------------
    const body = PreviewBodySchema.parse(request.body);
    const options = resolveImportOptions(body.options);

    let preview: ImportPreview;
    const first = body.rows[0];

    if (first && isPreviewRow(first)) {
      // El panel devuelve filas ya revisadas: solo se recalculan los totales.
      preview = recountPreview(body.rows as unknown as ImportRowPreview[], body.headers ?? [], options);
    } else {
      const rows = body.rows.map((row) => normalizeRow(row));
      const headers = body.headers ?? Object.keys(rows[0] ?? {});
      preview = buildPreview({ headers, rows, options });
    }

    reply.send(preview);
  });

  app.post('/weddings/:id/import/commit', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const body = CommitBodySchema.parse(request.body);
    const options = resolveImportOptions(body.options);

    const result = await commitImport({
      weddingId: wedding.id,
      rows: body.rows as ImportRowPreview[],
      options,
    });

    reply.send(result);
  });

  /** Últimos eventos de importación de una boda (para el panel). */
  app.get('/weddings/:id/import/history', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const wedding = await requireOwnedWedding(request.user.sub, id, reply);
    if (!wedding) return;

    const events = await prisma.eventLog.findMany({
      where: { weddingId: wedding.id, type: { in: ['import.preview', 'import.commit'] } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    reply.send(events);
  });
}
