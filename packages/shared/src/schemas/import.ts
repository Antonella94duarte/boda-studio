import { z } from 'zod';

/**
 * ---------------------------------------------------------------------------
 * Importación de invitados desde Excel (.xlsx), CSV o TXT.
 * ---------------------------------------------------------------------------
 * La organizadora NO tiene que renombrar columnas: el sistema detecta alias
 * ("Celular", "WhatsApp", "Tel.", "Nro", ...) y muestra una previsualización
 * con los errores antes de guardar nada.
 */

export const IMPORT_FIELDS = [
  'fullName',
  'phone',
  'passes',
  'groupName',
  'notes',
  'ignore',
] as const;
export const ImportFieldSchema = z.enum(IMPORT_FIELDS);
export type ImportField = z.infer<typeof ImportFieldSchema>;

/** Alias reconocidos automáticamente, sin acentos y en minúsculas. */
export const FIELD_ALIASES: Record<Exclude<ImportField, 'ignore'>, string[]> = {
  fullName: [
    'nombre',
    'nombres',
    'nombre completo',
    'invitado',
    'invitados',
    'apellido y nombre',
    'nombre y apellido',
    'familia',
    'guest',
    'name',
    'fullname',
    'full name',
    'titular',
  ],
  phone: [
    'telefono',
    'celular',
    'cel',
    'whatsapp',
    'wpp',
    'wa',
    'movil',
    'móvil',
    'numero',
    'número',
    'nro',
    'tel',
    'phone',
    'mobile',
    'contacto',
  ],
  passes: [
    'pases',
    'pas',
    'pase',
    'cupos',
    'cupo',
    'invitaciones',
    'cantidad',
    'cant',
    'personas',
    'qty',
    'passes',
    'pax',
  ],
  groupName: ['grupo', 'familia', 'mesa', 'tarjeta', 'invitacion', 'group'],
  notes: ['notas', 'nota', 'observaciones', 'observacion', 'comentarios', 'detalle', 'comments'],
};

/**
 * Alias ya normalizados ("teléfono" -> "telefono"), para que la tabla de
 * arriba se pueda escribir con acentos sin dejar de coincidir.
 */
const NORMALIZED_ALIASES: [Exclude<ImportField, 'ignore'>, string[]][] = (
  Object.entries(FIELD_ALIASES) as [Exclude<ImportField, 'ignore'>, string[]][]
).map(([field, aliases]) => [field, aliases.map(normalizeHeader)]);

/** Normaliza un encabezado: sin acentos, sin espacios dobles, minúsculas. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Adivina a qué campo corresponde un encabezado. */
export function guessField(header: string): ImportField {
  const h = normalizeHeader(header);
  if (!h) return 'ignore';
  for (const [field, aliases] of NORMALIZED_ALIASES) {
    if (aliases.includes(h)) return field;
  }
  // Coincidencia parcial: "telefono celular", "nombre del invitado".
  for (const [field, aliases] of NORMALIZED_ALIASES) {
    if (aliases.some((a) => h.includes(a))) return field;
  }
  return 'ignore';
}

export const ColumnMappingSchema = z.record(z.string(), ImportFieldSchema);
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export const ImportOptionsSchema = z.object({
  /** País por defecto para números sin código internacional. */
  defaultCountry: z.string().default('PY'),
  /** Pases asignados cuando el archivo no trae esa columna. */
  defaultPasses: z.number().int().min(1).max(20).default(2),
  /** Si ya existe un invitado con ese teléfono, qué hacer. */
  onDuplicate: z.enum(['skip', 'update', 'duplicate']).default('skip'),
  /** Agrupar por nombre de grupo/familia en un solo mensaje. */
  groupByFamily: z.boolean().default(false),
  columnMapping: ColumnMappingSchema.optional(),
});
export type ImportOptions = z.infer<typeof ImportOptionsSchema>;

export interface ImportRowPreview {
  /** Número de fila en el archivo original (1 = primera fila de datos). */
  row: number;
  fullName: string;
  rawPhone: string;
  phone?: string;
  passes: number;
  groupName?: string;
  notes?: string;
  /** ok | warning (se importa igual) | error (se descarta) */
  level: 'ok' | 'warning' | 'error';
  issues: string[];
}

export interface ImportPreview {
  /** Encabezados detectados en el archivo. */
  headers: string[];
  mapping: ColumnMapping;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  rows: ImportRowPreview[];
  /** Grupos detectados, si groupByFamily está activo. */
  groupCount: number;
}
