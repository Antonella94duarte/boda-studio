import {
  ImportOptionsSchema,
  guessField,
  normalizePhone,
  type ColumnMapping,
  type ImportField,
  type ImportOptions,
  type ImportPreview,
  type ImportRowPreview,
} from '@boda/shared';

/**
 * ---------------------------------------------------------------------------
 * Previsualización de una importación.
 * ---------------------------------------------------------------------------
 * Nada se guarda todavía: se muestra exactamente qué va a pasar (quién entra,
 * quién queda con avisos y quién se descarta) para que la organizadora corrija
 * el archivo antes de tocar la base.
 *
 * Niveles:
 *   ok      -> se importa sin revisión
 *   warning -> se importa, pero conviene mirarlo (teléfono repetido, pases raros)
 *   error   -> NO se importa (sin nombre o sin teléfono válido)
 */

export interface BuildPreviewInput {
  /** Encabezados del archivo, en orden. */
  headers: string[];
  /** Filas del archivo ya convertidas a texto. */
  rows: Array<Record<string, string>>;
  /** Opciones del panel (se completan con los valores por defecto del contrato). */
  options?: Partial<ImportOptions> | undefined;
}

/**
 * Completa las opciones con los valores por defecto de `@boda/shared`.
 *
 * Acepta `unknown` a propósito: en el camino multipart las opciones llegan como
 * texto JSON ya parseado, y validarlas acá evita obligar a cada ruta a castear.
 */
export function resolveImportOptions(options?: unknown): ImportOptions {
  return ImportOptionsSchema.parse(options ?? {});
}

/** Mapea encabezados -> campo, respetando el mapeo manual si lo hay. */
export function buildMapping(headers: string[], options?: Partial<ImportOptions>): ColumnMapping {
  const override = options?.columnMapping;
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    mapping[header] = override?.[header] ?? guessField(header);
  }
  return mapping;
}

/** Primer valor no vacío de las columnas mapeadas a un campo. */
function pick(record: Record<string, string>, pairs: Array<[string, ImportField]>, field: ImportField): string {
  for (const [header, mapped] of pairs) {
    if (mapped !== field) continue;
    const value = (record[header] ?? '').trim();
    if (value !== '') return value;
  }
  return '';
}

export function buildPreview(input: BuildPreviewInput): ImportPreview {
  const options = resolveImportOptions(input.options);
  const mapping = buildMapping(input.headers, options);
  const pairs = Object.entries(mapping) as Array<[string, ImportField]>;

  const previewRows: ImportRowPreview[] = [];
  const seenPhones = new Map<string, number>();
  const groups = new Set<string>();

  let totalRows = 0;
  let validRows = 0;
  let warningRows = 0;
  let errorRows = 0;

  for (let index = 0; index < input.rows.length; index += 1) {
    const record = input.rows[index];
    if (!record) continue;

    const rowNumber = index + 1;
    const rawName = pick(record, pairs, 'fullName');
    const rawPhone = pick(record, pairs, 'phone');
    const rawPasses = pick(record, pairs, 'passes');
    const groupName = pick(record, pairs, 'groupName');
    const notes = pick(record, pairs, 'notes');

    // Fila sin ningún dato: se ignora (no cuenta como error).
    if (!rawName && !rawPhone && !rawPasses && !groupName && !notes) continue;

    totalRows += 1;

    const issues: string[] = [];
    // El `as` es necesario: TypeScript no ve que `addIssue` (llamado más abajo)
    // cambia `level` desde un cierre, así que sin esto lo dejaría estrechado al
    // literal 'ok' y las comparaciones de las líneas siguientes darían TS2367.
    let level = 'ok' as ImportRowPreview['level'];

    const addIssue = (message: string, kind: 'error' | 'warning' = 'error'): void => {
      issues.push(message);
      if (kind === 'error') level = 'error';
      else if (level !== 'error') level = 'warning';
    };

    if (!rawName) addIssue('Falta el nombre del invitado');
    if (!rawPhone) addIssue('Falta el teléfono');

    let phone: string | undefined;
    if (rawPhone) {
      const normalized = normalizePhone(rawPhone, { defaultCountry: options.defaultCountry });
      if (normalized.ok) {
        phone = normalized.e164;
        const previousRow = seenPhones.get(normalized.e164);
        if (previousRow !== undefined) {
          addIssue(`Teléfono repetido dentro del archivo (ya aparece en la fila ${previousRow})`, 'warning');
        } else {
          seenPhones.set(normalized.e164, rowNumber);
        }
      } else {
        addIssue(`Teléfono inválido: ${normalized.reason}`);
      }
    }

    let passes = options.defaultPasses;
    if (rawPasses) {
      const match = rawPasses.match(/\d+/);
      const parsed = match ? Number.parseInt(match[0]!, 10) : Number.NaN;
      if (Number.isNaN(parsed)) {
        addIssue(
          `No se entiende la cantidad de pases ("${rawPasses}"): se usarán ${options.defaultPasses}`,
          'warning',
        );
      } else if (parsed < 1 || parsed > 20) {
        passes = Math.min(20, Math.max(1, parsed));
        addIssue(`Pases fuera de rango ("${rawPasses}"): se usarán ${passes}`, 'warning');
      } else {
        passes = parsed;
      }
    }

    if (level === 'error') errorRows += 1;
    else if (level === 'warning') warningRows += 1;
    else validRows += 1;

    if (options.groupByFamily && groupName && level !== 'error') groups.add(groupName);

    previewRows.push({
      row: rowNumber,
      fullName: rawName,
      rawPhone,
      phone,
      passes,
      groupName: groupName === '' ? undefined : groupName,
      notes: notes === '' ? undefined : notes,
      level,
      issues,
    });
  }

  return {
    headers: input.headers,
    mapping,
    totalRows,
    validRows,
    warningRows,
    errorRows,
    rows: previewRows,
    groupCount: options.groupByFamily ? groups.size : 0,
  };
}

/**
 * Recalcula los contadores de una previsualización ya existente.
 * Sirve cuando el panel devuelve las filas editadas a mano (por ejemplo, la
 * organizadora corrige un teléfono) y hay que volver a mostrar el resumen.
 */
export function recountPreview(
  rows: ImportRowPreview[],
  headers: string[],
  options: ImportOptions,
): ImportPreview {
  const validRows = rows.filter((row) => row.level === 'ok').length;
  const warningRows = rows.filter((row) => row.level === 'warning').length;
  const errorRows = rows.filter((row) => row.level === 'error').length;
  const groups = new Set(
    rows
      .filter((row) => row.level !== 'error' && row.groupName)
      .map((row) => row.groupName as string),
  );

  return {
    headers,
    mapping: options.columnMapping ?? {},
    totalRows: rows.length,
    validRows,
    warningRows,
    errorRows,
    rows,
    groupCount: options.groupByFamily ? groups.size : 0,
  };
}
