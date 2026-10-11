/**
 * ---------------------------------------------------------------------------
 * Lector de CSV/TXT/TSV.
 * ---------------------------------------------------------------------------
 * La organizadora exporta sus listas desde Excel, Google Sheets o el teléfono:
 * el archivo puede venir separado por comas, punto y coma, tabulaciones o
 * barras, con acentos, con BOM y con comillas. Todo eso se resuelve acá.
 */

const DELIMITERS = [',', ';', '\t', '|'] as const;

export type Delimiter = (typeof DELIMITERS)[number];

/**
 * Convierte un buffer a texto.
 *
 * Excel en Windows guarda los CSV en latin-1 (Windows-1252); si se leen como
 * UTF-8 los acentos se rompen ("RamÃ³n"). Se detecta por el carácter de
 * reemplazo U+FFFD y, en ese caso, se relee como latin-1.
 */
export function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  if (utf8.includes('\uFFFD')) {
    return buffer.toString('latin1');
  }
  return utf8;
}

/** Cuenta las apariciones de un separador fuera de las comillas. */
function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) count += 1;
  }

  return count;
}

/** Adivina el separador mirando las primeras líneas con contenido. */
export function detectDelimiter(text: string): string {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(0, 5);

  let best: string = ',';
  let bestScore = 0;

  for (const candidate of DELIMITERS) {
    let score = 0;
    for (const line of lines) score += countOutsideQuotes(line, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/** Una fila con todas las celdas vacías no aporta nada: no se devuelve. */
function pushRow(rows: string[][], cells: string[]): void {
  const trimmed = cells.map((cell) => cell.trim());
  if (trimmed.every((cell) => cell === '')) return;
  rows.push(trimmed);
}

/**
 * Convierte texto delimitado en una matriz de celdas.
 *
 * - Detecta el separador automáticamente (`,`, `;`, tabulación o `|`).
 * - Respeta comillas: `"Pérez, Ana"` es una sola celda y `""` es una comilla.
 * - Los saltos de línea dentro de comillas no cortan la fila.
 * - Ignora el BOM inicial y las líneas totalmente vacías.
 * - Recorta los espacios sobrantes de cada celda.
 */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const separator = delimiter ?? detectDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    // Las comillas solo abren un campo entrecomillado al inicio de la celda.
    if (char === '"' && field === '') {
      inQuotes = true;
      continue;
    }

    if (char === separator) {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      pushRow(rows, row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  // El archivo puede no terminar en salto de línea.
  if (field !== '' || row.length > 0) {
    row.push(field);
    pushRow(rows, row);
  }

  return rows;
}
