import { extname } from 'node:path';
import { FIELD_ALIASES, normalizeHeader } from '@boda/shared';
import * as XLSXModule from 'xlsx';
import { decodeText, parseDelimited } from '../../utils/csv.js';

/**
 * `xlsx` se distribuye como CommonJS: según cómo lo resuelva Node, los helpers
 * pueden llegar en el namespace o dentro de `default`. Se acepta cualquiera de
 * las dos formas (sin usar `any`).
 */
const XLSX = (XLSXModule as unknown as { default?: typeof XLSXModule }).default ?? XLSXModule;

/**
 * ---------------------------------------------------------------------------
 * Lectura de archivos de invitados.
 * ---------------------------------------------------------------------------
 * Soporta .xlsx / .xls (SheetJS), .csv y .txt (separador autodetectado) y
 * .tsv (tabulaciones). Devuelve encabezados + filas ya convertidas a texto.
 *
 * Regla clave: si el archivo NO trae fila de encabezados (la organizadora
 * pegó la lista sin títulos), se sintetizan "columna1..N" y la primera fila se
 * trata como dato. Se detecta porque la fila contiene algo con pinta de
 * teléfono y ninguna celda coincide exactamente con un alias conocido.
 */

export interface ParsedFile {
  headers: string[];
  rows: Array<Record<string, string>>;
}

const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'];

export function isSpreadsheet(filename: string): boolean {
  return SPREADSHEET_EXTENSIONS.includes(extname(filename).toLowerCase());
}

/** Convierte una celda de Excel (texto, número, fecha, booleano) en texto. */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    // Los teléfonos suelen venir como número: se evita la notación científica.
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim();
}

/** ¿La celda parece un teléfono? ("0976 178000", "+595 976 178 000") */
function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (!/^[+\d\s().\-/]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D+/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * ¿La celda es exactamente un alias conocido de columna?
 * Se exige coincidencia exacta (no parcial) para no confundir datos con
 * encabezados: "Mesa 1" no es un encabezado, "Mesa" sí.
 */
function looksLikeHeaderCell(cell: string): boolean {
  const normalized = normalizeHeader(cell);
  if (!normalized) return false;
  return Object.values(FIELD_ALIASES).some((aliases) => aliases.includes(normalized));
}

function looksLikeHeaderRow(row: string[]): boolean {
  const cells = row.map((cell) => cell.trim()).filter((cell) => cell !== '');
  if (cells.length === 0) return false;
  if (cells.some(looksLikePhone)) return false;
  return cells.some(looksLikeHeaderCell);
}

/** Evita que dos columnas con el mismo título se pisen en el objeto fila. */
function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const count = (seen.get(header) ?? 0) + 1;
    seen.set(header, count);
    return count === 1 ? header : `${header} (${count})`;
  });
}

function buildParsed(matrix: string[][]): ParsedFile {
  const cleaned = matrix.filter((row) => row.some((cell) => cell.trim() !== ''));
  const first = cleaned[0];
  if (!first) return { headers: [], rows: [] };

  const hasHeader = looksLikeHeaderRow(first);
  const headerCells = hasHeader ? first : first.map((_, index) => `columna${index + 1}`);
  const dataRows = hasHeader ? cleaned.slice(1) : cleaned;

  const headers = uniqueHeaders(
    headerCells.map((cell, index) => (cell.trim() === '' ? `columna${index + 1}` : cell.trim())),
  );

  const rows = dataRows.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });

  return { headers, rows };
}

/** ¿El buffer es un ZIP (xlsx/ods) o un OLE (xls) aunque el nombre no lo diga? */
function isSpreadsheetBuffer(buffer: Buffer): boolean {
  if (buffer.length >= 4) {
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf;
    if (isZip || isOle) return true;
  }
  return false;
}

function readSpreadsheet(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  });

  return raw.map((row) => (Array.isArray(row) ? (row as unknown[]).map(cellToString) : []));
}

/** Lee el archivo completo: encabezados detectados y filas como objetos. */
export async function parseFileToRows(buffer: Buffer, filename: string): Promise<ParsedFile> {
  const extension = extname(filename).toLowerCase();
  const spreadsheet = SPREADSHEET_EXTENSIONS.includes(extension)
    ? true
    : extension === ''
      ? isSpreadsheetBuffer(buffer)
      : false;

  if (spreadsheet) {
    return buildParsed(readSpreadsheet(buffer));
  }

  const text = decodeText(buffer);
  const matrix = parseDelimited(text, extension === '.tsv' ? '\t' : undefined);
  return buildParsed(matrix);
}
