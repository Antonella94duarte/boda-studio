import type { ImportOptions, ImportRowPreview } from '@boda/shared';
import { prisma } from '../../prisma.js';
import { logEvent } from '../events.js';
import { generateGuestToken } from '../tokens.js';

/**
 * ---------------------------------------------------------------------------
 * Confirmación de una importación.
 * ---------------------------------------------------------------------------
 * Persiste las filas ya revisadas. Las filas con `level: 'error'` se informan
 * pero nunca se guardan; las de `warning` sí (implica que tienen nombre y
 * teléfono válidos).
 *
 * `onDuplicate` decide qué pasa cuando el teléfono ya existe en la boda:
 *   skip      -> se deja intacto al invitado existente
 *   update    -> se actualizan nombre, pases y grupo
 *   duplicate -> se inserta igual (dos invitados con el mismo teléfono)
 */

export interface CommitImportInput {
  weddingId: string;
  rows: ImportRowPreview[];
  options: ImportOptions;
}

export interface CommitImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

/** Reintenta con un token nuevo si el azar produjo una colisión (P2002). */
async function createGuest(
  weddingId: string,
  row: ImportRowPreview & { phone: string },
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.guest.create({
        data: {
          weddingId,
          token: generateGuestToken(),
          fullName: row.fullName,
          rawPhone: row.rawPhone,
          phone: row.phone,
          passes: row.passes,
          groupName: row.groupName ?? null,
          notes: row.notes ?? null,
        },
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo guardar el invitado');
}

export async function commitImport(input: CommitImportInput): Promise<CommitImportResult> {
  const result: CommitImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of input.rows) {
    if (row.level === 'error' || !row.phone) {
      result.errors.push({
        row: row.row,
        message: row.issues.length > 0 ? row.issues.join('; ') : 'La fila no tiene datos válidos',
      });
      continue;
    }

    const phone = row.phone;

    try {
      const existing = await prisma.guest.findFirst({
        where: { weddingId: input.weddingId, phone },
        select: { id: true, fullName: true, rawPhone: true },
      });

      if (existing) {
        if (input.options.onDuplicate === 'skip') {
          result.skipped += 1;
          continue;
        }

        if (input.options.onDuplicate === 'update') {
          await prisma.guest.update({
            where: { id: existing.id },
            data: {
              fullName: row.fullName !== '' ? row.fullName : existing.fullName,
              rawPhone: row.rawPhone !== '' ? row.rawPhone : existing.rawPhone,
              passes: row.passes,
              // El grupo y las notas solo se pisan si el archivo los trae.
              ...(row.groupName ? { groupName: row.groupName } : {}),
              ...(row.notes ? { notes: row.notes } : {}),
            },
          });
          result.updated += 1;
          continue;
        }
        // onDuplicate === 'duplicate': cae al create de abajo.
      }

      await createGuest(input.weddingId, { ...row, phone });
      result.created += 1;
    } catch (error) {
      result.errors.push({
        row: row.row,
        message: error instanceof Error ? error.message : 'Error desconocido al guardar el invitado',
      });
    }
  }

  await logEvent({
    weddingId: input.weddingId,
    type: 'import.commit',
    message: `Importación: ${result.created} creados, ${result.updated} actualizados, ${result.skipped} omitidos, ${result.errors.length} con error`,
    payload: {
      total: input.rows.length,
      ...result,
      errors: result.errors.slice(0, 20),
      onDuplicate: input.options.onDuplicate,
    },
  });

  return result;
}
